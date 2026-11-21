// Leaf lookup by legacy 1... address or hash160, plus the table of the real rows of the pinned window.
import { sha256 } from '@noble/hashes/sha2.js';
import { decodeBase58AddressFormat, Base58AddressFormatVersion } from '@bitauth/libauth';
import { parseDistro, toBaseUnits } from '../../src/snapshot.ts';
import { demoKey, publicKey } from '../../src/keys.ts';
import { hash160 } from '../../src/identity.ts';
import { bytesToHex, hexToBytes } from '../../src/merkle.ts';
import type { EpochFile } from '../../src/pool-client.ts';
import { $, NETS, dataUrl, epochToShow, esc, fmtInt, fmtTokens, loadEpoch, shortHex, type Ctx } from './chain.ts';
import { entryOf, selectLeaf } from './leafview.ts';

type Row = { address: string; units: bigint; index: number };
let ctx: Ctx;
let ef: EpochFile;
let rows: Row[] = [];
let demo = new Map<string, number>();
let showAll = false;

const demoIds = (net: Ctx['net'], n: number) => new Map(Array.from({ length: n }, (_, i) => [bytesToHex(hash160(publicKey(demoKey(net, i)))), i] as const));
const indexOfIdentity = (idHex: string) => ef.entries.findIndex((e) => e.method === 1 && e.identity === idHex);

function identityOf(input: string): { id: string; address?: string } | string {
  const v = input.trim();
  if (/^[0-9a-fA-F]{40}$/.test(v)) return { id: v.toLowerCase() };
  const d: any = decodeBase58AddressFormat(v, { hash: (b: Uint8Array) => sha256(b) } as any);
  if (typeof d === 'string') return 'That is neither a legacy 1... address nor a 40 character hash160.';
  if (d.version !== Base58AddressFormatVersion.p2pkh) return 'That is a legacy script address. Leaves exist only for key addresses that start with 1.';
  return { id: bytesToHex(d.payload), address: v };
}

function show(index: number, address?: string) {
  const e = entryOf(ef, index);
  const id = bytesToHex(e.identity);
  const di = demo.get(id);
  const sym = NETS[ctx.net].symbol;
  $('lookup-out').innerHTML = `<div class="found">
    <div class="row"><span class="lbl">Identity</span><span class="mono">${esc(address ?? id)}<br>hash160 ${id}</span></div>
    <div class="row"><span class="lbl">Kind</span><span>${di === undefined ? 'real row from the sponsor API: its own key signs the claim' : `demo leaf ${di}: its published key signs the claim`}</span></div>
    <div class="row"><span class="lbl">Cumulative</span><span>${fmtTokens(e.cumulative)} ${sym} <span class="mono">${e.cumulative} base units</span></span></div>
    <div class="row"><span class="lbl">Leaf</span><span>index ${index} of ${ef.entries.length} \u00b7 proof depth ${ef.depth} \u00b7 epoch ${ef.epoch}</span></div></div>`;
  selectLeaf(ctx, ef, index, di === undefined ? 'real row' : `demo leaf ${di}`);
}

function renderRows() {
  const body = $('rows').querySelector('tbody')!;
  const list = showAll ? rows : rows.slice(0, 8);
  body.innerHTML = list.map((r, k) => `<tr><td class="mono" title="${esc(r.address)}">${esc(shortHex(r.address, 10, 6))}</td><td class="num">${fmtTokens(r.units)}</td><td class="num">${r.index}</td><td><button class="link" type="button" data-i="${k}">Show proof</button></td></tr>`).join('');
  body.querySelectorAll('button.link').forEach((b) => b.addEventListener('click', () => {
    const r = list[Number((b as HTMLElement).dataset.i)];
    show(r.index, r.address);
    $('proof').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }));
  const more = $('rows-more') as HTMLButtonElement;
  more.hidden = rows.length <= 8;
  more.textContent = showAll ? 'Show the largest 8' : `Show all ${rows.length} rows`;
}

/** The largest real row goes on the plate first, so the first path drawn is a real folder's. */
export function selectDefault() { if (rows.length) show(rows[0].index, rows[0].address); }

export async function initLookup(c: Ctx) {
  ctx = c;
  ef = await loadEpoch(c, epochToShow(c, c.snap!));
  demo = demoIds(c.net, Number((ef.params as any).demoCount));
  const raw = new Uint8Array(await (await fetch(dataUrl(c.net, `distro-${ef.epoch}.json`))).arrayBuffer());
  const { rows: api } = parseDistro(raw);
  const byId = new Map<string, Row>();
  for (const r of api) {
    if (!r.bitcoinAddress) continue;
    const d: any = decodeBase58AddressFormat(r.bitcoinAddress, { hash: (b: Uint8Array) => sha256(b) } as any);
    if (typeof d === 'string' || d.version !== Base58AddressFormatVersion.p2pkh) continue;
    const id = bytesToHex(d.payload);
    const index = indexOfIdentity(id);
    if (index < 0) continue;
    const have = byId.get(id);
    if (have) have.units += toBaseUnits(r.amountText); else byId.set(id, { address: r.bitcoinAddress, units: toBaseUnits(r.amountText), index });
  }
  rows = [...byId.values()].sort((a, b) => (a.units < b.units ? 1 : a.units > b.units ? -1 : 0));
  const realCount = ef.entries.length - Number((ef.params as any).demoCount);
  const p: any = ef.params;
  $('lookup-intro').textContent = `The real rows are the ${realCount} FoldingCash folders of the pinned window ${p.startDate} to ${p.endDate}, built from the live sponsor API. Their own key, the one behind the legacy 1... address, signs the claim and picks the destination. The other ${p.demoCount} leaves are demo leaves with published keys.`;
  $('lookupform').addEventListener('submit', (e) => {
    e.preventDefault();
    const hint = $('lookup-hint');
    const r = identityOf(($('lookup-in') as HTMLInputElement).value);
    if (typeof r === 'string') { hint.textContent = r; hint.className = 'hint bad'; $('lookup-out').innerHTML = ''; return; }
    const i = indexOfIdentity(r.id);
    if (i < 0) { hint.textContent = `No leaf for this identity in epoch ${ef.epoch}. The tree holds ${fmtInt(ef.entries.length)} leaves.`; hint.className = 'hint bad'; $('lookup-out').innerHTML = ''; return; }
    hint.textContent = ''; hint.className = 'hint';
    show(i, r.address);
  });
  $('rows-more').addEventListener('click', () => { showAll = !showAll; renderRows(); });
  renderRows();
}
