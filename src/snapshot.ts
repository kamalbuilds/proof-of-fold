// Builds the payout leaves from a FoldingCash GetDistro response. Pure: no I/O besides the optional fetch helper.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { decodeBase58AddressFormat, Base58AddressFormatVersion, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { MerkleTree, leafKey, type Entry } from './merkle.ts';
import { demoKey, publicKey, type Net } from './keys.ts';
import { hash160 } from './identity.ts';

export const API = 'https://api.folding.cash/v1/GetDistro';
export const DECIMALS = 8;
export type Window = { startDate: string; endDate: string; amount: string };   // MM-DD-YYYY, whole tokens

export const distroUrl = (w: Window) => `${API}?startDate=${w.startDate}&endDate=${w.endDate}&amount=${w.amount}`;

/** Fetch the raw response bytes: the hash that goes on chain is over exactly these bytes. */
export async function fetchRaw(w: Window): Promise<Uint8Array> {
  const r = await fetch(distroUrl(w));
  if (!r.ok) throw new Error(`GetDistro ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
export const rawHash = (raw: Uint8Array): Uint8Array => sha256(raw);

/** "300554.94300812" -> 30055494300812n. Reads the decimal text, never a float. Digits past 8 places are dropped. */
export function toBaseUnits(decimal: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!m) throw new Error(`bad amount ${decimal}`);
  return BigInt(m[1] + (m[2] ?? '').padEnd(DECIMALS, '0').slice(0, DECIMALS));
}

export type Skipped = { address: string; reason: string; amount: string };
export type Built = { entries: Entry[]; skipped: Skipped[]; rows: number; totalUnits: bigint; meta: Record<string, unknown> };

function classify(row: any): { method: 0 | 1; identity: Uint8Array } | string {
  if (row.bitcoinAddress) {
    const d = decodeBase58AddressFormat(row.bitcoinAddress, { hash: (b: Uint8Array) => sha256(b) } as any);
    if (typeof d === 'string') return `bad legacy address: ${d}`;
    if (d.version === Base58AddressFormatVersion.p2pkh) return { method: 1, identity: d.payload };
    return 'legacy P2SH address: no key to prove the link';
  }
  for (const field of ['cashTokensAddress', 'bitcoinCashAddress'] as const) {
    if (!row[field]) continue;
    const r = cashAddressToLockingBytecode(row[field]);
    if (typeof r === 'string') return `bad cash address: ${r}`;
    return { method: 0, identity: r.bytecode };
  }
  return row.slpAddress ? 'SLP-only address' : 'no payable address';
}

/** The raw response, parsed with exact decimal amounts (the amount text is read from the bytes, not from a double). */
export function parseDistro(raw: Uint8Array): { rows: any[]; meta: Record<string, unknown> } {
  const text = new TextDecoder().decode(raw);
  const amounts = [...text.matchAll(/"amount":\s*(-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/g)].map((m) => m[1]);
  const json = JSON.parse(text);
  if (!json.success || !Array.isArray(json.distro)) throw new Error('GetDistro did not succeed');
  if (amounts.length !== json.distro.length) throw new Error('could not pair amounts with rows');
  const rows = json.distro.map((r: any, i: number) => ({ ...r, amountText: amounts[i] }));
  const { distro: _d, ...meta } = json;
  return { rows, meta };
}

/** Merge rows into leaves. Rows that share an identity add up. Rows without a provable identity are listed, never paid. */
export function buildEntries(raw: Uint8Array): Built {
  const { rows, meta } = parseDistro(raw);
  const byKey = new Map<string, Entry>();
  const skipped: Skipped[] = [];
  let totalUnits = 0n;
  for (const row of rows) {
    const units = toBaseUnits(row.amountText);
    const id = classify(row);
    if (typeof id === 'string') { skipped.push({ address: row.bitcoinAddress ?? row.cashTokensAddress ?? row.bitcoinCashAddress ?? '', reason: id, amount: row.amountText }); continue; }
    const k = bytesToHex(leafKey(id));
    const have = byKey.get(k);
    if (have) have.cumulative += units; else byKey.set(k, { ...id, cumulative: units });
    totalUnits += units;
  }
  const entries = [...byKey.values()].filter((e) => e.cumulative > 0n);
  return { entries, skipped, rows: rows.length, totalUnits, meta };
}

/** Demo leaves: published keys, derived from the network and index so anyone can recompute them. */
export function demoEntries(net: Net, count: number, unitsEach: bigint): Entry[] {
  return Array.from({ length: count }, (_, i) => ({ method: 1 as const, identity: hash160(publicKey(demoKey(net, i))), cumulative: unitsEach }));
}

export const sortEntries = (entries: Entry[]): Entry[] =>
  [...entries].sort((a, b) => a.method - b.method || bytesToHex(a.identity).localeCompare(bytesToHex(b.identity)));

export function buildTree(raw: Uint8Array, demo: Entry[]): { tree: MerkleTree; built: Built } {
  const built = buildEntries(raw);
  return { tree: new MerkleTree(sortEntries([...built.entries, ...demo])), built };
}
