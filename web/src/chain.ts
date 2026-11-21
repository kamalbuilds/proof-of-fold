// Shared page context: network choice, data files, the Electrum provider and the chain snapshot the sections read.
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { attach, type Deployment, type EpochFile } from '../../src/pool-client.ts';
import { bytesToHex } from '../../src/merkle.ts';
import { DECIMALS } from '../../src/snapshot.ts';
import { setFeeRate } from '../../src/fee-rate.ts';

export type Net = 'chipnet' | 'mainnet';
export const NETS: Record<Net, { symbol: string; prefix: string; tx: string; address: string; label: string }> = {
  chipnet: { symbol: 'tFLDCH', prefix: 'bchtest', tx: 'https://chipnet.imaginary.cash/tx/', address: 'https://chipnet.imaginary.cash/address/', label: 'chipnet' },
  mainnet: { symbol: 'FLDCH', prefix: 'bitcoincash', tx: 'https://blockchair.com/bitcoin-cash/transaction/', address: 'https://blockchair.com/bitcoin-cash/address/', label: 'mainnet' },
};
/** SolidCash funds at 1 sat/byte; chipnet carries a standing 1 sat/byte backlog, so the page pays more (same rates as scripts/run.ts; a claim is about 7.8 kB). */
export const FEE_RATE: Record<Net, number> = { chipnet: 2, mainnet: 2 };
export const SPONSOR_API = 'https://api.folding.cash/v1/GetDistro';

export type Snap = {
  at: number; tip: number;
  status: number; activeEpoch: number; activeRoot: string; activeSnapshot: string;
  pendingEpoch: number; pendingRoot: string; pendingSnapshot: string; highEpoch: number;
  masterHeight: number | null;       // confirmation height of the registry's master UTXO, 0 while unconfirmed
  poolEpoch: number; poolRoot: string; poolTokens: bigint;
};
export type Ctx = {
  net: Net; d: Deployment; provider: any; registry: any; pool: any;
  epochs: number[]; snap?: Snap;
};

/** chipnet's node counts a relative lock unit as roughly 10 minutes, so a block countdown reads as a time estimate there. */
export const lockEta = (c: { net: Net }, left: number) => (c.net === 'chipnet' ? ` (about ${left * 10} minutes on chipnet)` : '');

const ZERO_ROOT = '0'.repeat(64);
export const isZeroRoot = (h: string) => h === ZERO_ROOT;
export const fetchJson = async <T>(path: string): Promise<T> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
};
export const dataUrl = (net: Net, file: string) => `./data/${net}/${file}`;

export async function openContext(net: Net, epochs: number[]): Promise<Ctx> {
  const d = await fetchJson<Deployment>(dataUrl(net, 'deployment.json'));
  setFeeRate(FEE_RATE[net]);
  // chipnet.bch.ninja (the SDK default) keeps a stale mempool; chipnet.imaginary.cash does not.
  const provider: any = new ElectrumNetworkProvider(net as any, { manualConnectionManagement: true, ...(net === 'chipnet' ? { hostname: 'chipnet.imaginary.cash' } : {}) } as any);
  await provider.connect();
  const { registry, pool } = attach(d, provider);
  return { net, d, provider, registry, pool, epochs };
}

export async function readSnap(c: Ctx): Promise<Snap> {
  const cat = c.d.tokenCategory;
  const [tip, rs, ps, tokens, utxos] = await Promise.all([
    c.provider.getBlockHeight() as Promise<number>,
    c.registry.getState(),
    c.pool.getState(),
    c.pool.tokens[cat].amount as Promise<bigint>,
    c.provider.getUtxos(c.d.registry.address) as Promise<any[]>,
  ]);
  const master = utxos.find((u) => u.token?.category === c.d.registry.categoryId && u.token.nft?.capability === 'minting');
  const hx = (b: Uint8Array) => bytesToHex(b);
  const snap: Snap = {
    at: Date.now(), tip,
    status: Number(rs.status), activeEpoch: Number(rs.activeEpoch), activeRoot: hx(rs.activeRoot), activeSnapshot: hx(rs.activeSnapshot),
    pendingEpoch: Number(rs.pendingEpoch), pendingRoot: hx(rs.pendingRoot), pendingSnapshot: hx(rs.pendingSnapshot), highEpoch: Number(rs.highEpoch),
    masterHeight: master ? master.blockHeight : null,
    poolEpoch: Number(ps.epoch), poolRoot: hx(ps.root), poolTokens: BigInt(tokens),
  };
  c.snap = snap;
  return snap;
}

/** Blocks the pending root still has to wait: the activation rule is the registry UTXO age in blocks. */
export function blocksToActivate(s: Snap, rootDelay: number): { confirmed: boolean; left: number } {
  if (s.masterHeight === null || s.masterHeight === 0) return { confirmed: false, left: rootDelay };
  const age = s.tip - s.masterHeight + 1;
  return { confirmed: true, left: Math.max(0, rootDelay - age) };
}

const epochCache = new Map<string, Promise<EpochFile>>();
export const loadEpoch = (c: Ctx, n: number) => {
  const k = `${c.net}/${n}`;
  if (!epochCache.has(k)) epochCache.set(k, fetchJson<EpochFile>(dataUrl(c.net, `epoch-${n}.json`)));
  return epochCache.get(k)!;
};
/** The epoch file to show: the one the chain names, else the nearest published one. */
export function epochToShow(c: Ctx, s: Snap): number {
  const want = s.poolEpoch || s.activeEpoch || s.pendingEpoch || 0;
  if (c.epochs.includes(want)) return want;
  return c.epochs[c.epochs.length - 1];
}

// formatting
export const fmtInt = (n: number | bigint) => n.toLocaleString('en-US');
/** Base units to a token amount with the 8 decimals trimmed to at least 2 places. */
export function fmtTokens(units: bigint): string {
  const base = 10n ** BigInt(DECIMALS);
  const whole = units / base;
  const frac = (units % base).toString().padStart(DECIMALS, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole.toLocaleString('en-US')}.${frac}`;
}
export const shortHex = (h: string, a = 8, b = 6) => (h.length <= a + b + 1 ? h : `${h.slice(0, a)}\u2026${h.slice(-b)}`);
export const txLink = (c: Ctx, txid: string, text = shortHex(txid, 10, 8)) => `<a class="hexlink" href="${NETS[c.net].tx}${txid}" target="_blank" rel="noopener">${text}</a>`;
export const addrLink = (c: Ctx, address: string, text = address) => `<a class="hexlink" href="${NETS[c.net].address}${address}" target="_blank" rel="noopener">${text}</a>`;
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
