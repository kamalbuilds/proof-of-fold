// Watcher: re-fetch the pinned API response, rebuild the tree, compare with the epoch file and with the registry on chain.
import { buildTree, demoEntries, rawHash, DECIMALS } from '../../src/snapshot.ts';
import { bytesToHex, type MerkleTree } from '../../src/merkle.ts';
import { $, dataUrl, esc, epochToShow, fmtInt, isZeroRoot, loadEpoch, type Ctx } from './chain.ts';

let ctx: Ctx;

async function loadRaw(url: string, fallback: string): Promise<{ raw: Uint8Array; source: string }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = new Uint8Array(await r.arrayBuffer());
    return { raw, source: `live API response, ${fmtInt(raw.length)} bytes, fetched just now from ${url}` };
  } catch (e: any) {
    const r = await fetch(fallback);
    if (!r.ok) throw new Error(`bundled ${fallback}: ${r.status}`);
    const raw = new Uint8Array(await r.arrayBuffer());
    return { raw, source: `bundled snapshot ${fallback.split('/').pop()}, ${fmtInt(raw.length)} bytes (the live fetch did not complete: ${e?.name === 'AbortError' ? 'timeout' : e?.message ?? e})` };
  }
}

/** Change the last digit of the integer part of the first amount, so exactly one leaf changes. */
export function tamper(raw: Uint8Array): { bytes: Uint8Array; note: string } {
  const text = new TextDecoder().decode(raw);
  const m = /"amount":\s*(-?[0-9]+)/.exec(text);
  if (!m) throw new Error('no amount found to alter');
  const at = m.index + m[0].length - 1;
  const old = text[at];
  const next = String((Number(old) + 1) % 10);
  const bytes = new TextEncoder().encode(text.slice(0, at) + next + text.slice(at + 1));
  return { bytes, note: `byte ${at}: amount digit ${old} became ${next} in the first row` };
}

export function build(raw: Uint8Array, net: Ctx['net'], params: any): { tree: MerkleTree; hash: string; root: string } {
  const demo = demoEntries(net, Number(params.demoCount), BigInt(params.demoWhole) * 10n ** BigInt(DECIMALS));
  const { tree } = buildTree(raw, demo);
  return { tree, hash: bytesToHex(rawHash(raw)), root: bytesToHex(tree.root) };
}

const cell = (v: string, ok: boolean | null) => `<td class="${ok === null ? '' : ok ? 'ok' : 'bad'}">${esc(v)}</td>`;
const mark = (ok: boolean | null) => (ok === null ? 'not comparable' : ok ? 'MATCH' : 'MISMATCH');

type Target = { epoch: number; role: 'active' | 'pending'; root: string; snap: string };

function targets(s: Ctx['snap'] & {}): Target[] {
  const t: Target[] = [];
  if (s.activeEpoch > 0 && !isZeroRoot(s.activeRoot)) t.push({ epoch: s.activeEpoch, role: 'active', root: s.activeRoot, snap: s.activeSnapshot });
  if (s.status === 1) t.push({ epoch: s.pendingEpoch, role: 'pending', root: s.pendingRoot, snap: s.pendingSnapshot });
  return t.filter((x) => ctx.epochs.includes(x.epoch));
}

/** One epoch: fetch the pinned response, rebuild, compare with the epoch file and the registry. Returns its block and whether everything compared equal. */
async function check(tg: Target | { epoch: number; role: 'none' }, altered: boolean): Promise<{ html: string; ok: boolean }> {
  const ef = await loadEpoch(ctx, tg.epoch);
  const { raw: genuine, source } = await loadRaw(ef.url, dataUrl(ctx.net, `distro-${ef.epoch}.json`));
  const t = altered ? tamper(genuine) : undefined;
  const mine = build(t ? t.bytes : genuine, ctx.net, ef.params);
  const chain = tg.role === 'none' ? null : tg;
  const rowsOf: [string, string, string, string | null][] = [
    ['SHA-256 of the response bytes', mine.hash, ef.snapshotSha256, chain ? chain.snap : null],
    ['Merkle root of the rebuilt tree', mine.root, ef.root, chain ? chain.root : null],
  ];
  const ok = rowsOf.flatMap(([, m, e, c]) => [m === e, c === null ? null : m === c]).every((x) => x !== false);
  let levels = '';
  if (t) {
    const base = build(genuine, ctx.net, ef.params).tree;
    const rows = mine.tree.levels.map((lv, k) => {
      const diff = lv.map((h, i) => (bytesToHex(h) !== bytesToHex(base.levels[k][i]) ? i : -1)).filter((i) => i >= 0);
      return { k, n: lv.length, diff };
    });
    const first = rows.find((r) => r.diff.length > 0);
    levels = `<div class="levels"><p class="src">Rebuilt tree against the genuine tree, level by level (level 0 holds the leaves, level ${mine.tree.depth} is the root)</p><table><thead><tr><th>level</th><th>nodes</th><th>differ</th><th>first differing index</th></tr></thead><tbody>${rows.map((r) => `<tr class="${first && r.k === first.k ? 'first' : ''}"><td>${r.k}${r.k === 0 ? ' leaves' : r.k === mine.tree.depth ? ' root' : ''}</td><td>${fmtInt(r.n)}</td><td>${r.diff.length}</td><td>${r.diff.length ? r.diff[0] : 'none'}</td></tr>`).join('')}</tbody></table><p class="src">First differing level: ${first ? first.k : 'none'}. ${esc(t.note)}.</p></div>`;
  }
  const title = chain ? `Registry ${chain.role}, epoch ${chain.epoch}` : `Epoch ${ef.epoch}`;
  const html = `<div class="wblock"><h3 class="sub">${title}</h3>
    <p class="src">Source: ${esc(t ? 'tampered copy of the response (one digit changed in memory), derived from the ' + source : source)}</p>
    <table class="cmp"><thead><tr><th>Value</th><th>Rebuilt here</th><th>epoch-${ef.epoch}.json</th><th>${chain ? 'registry ' + chain.role : 'registry'}</th></tr></thead><tbody>
    ${rowsOf.map(([label, m, e, c]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(m)}</td>${cell(e + '\n' + mark(m === e), m === e)}${c === null ? cell('not comparable: the registry holds no root for epoch ' + ef.epoch, null) : cell(c + '\n' + mark(m === c), m === c)}</tr>`).join('')}
    </tbody></table>${levels}</div>`;
  return { html, ok };
}

async function run(altered: boolean) {
  const out = $('watch-out');
  const go = $('watch-go') as HTMLButtonElement, tb = $('watch-tamper') as HTMLButtonElement;
  go.disabled = tb.disabled = true;
  out.innerHTML = '<p class="src">Fetching and hashing...</p>';
  try {
    const list = targets(ctx.snap!);
    const jobs = list.length ? list : [{ epoch: epochToShow(ctx, ctx.snap!), role: 'none' as const }];
    // a tampered copy alters the first (active) epoch only
    const res = [];
    for (let i = 0; i < jobs.length; i++) res.push(await check(jobs[i], altered && i === 0));
    const verdict = res.every((r) => r.ok);
    out.innerHTML = `<div class="verdict"><div class="stamp ${verdict ? 'ok' : 'bad'}">${verdict ? 'MATCH' : 'MISMATCH'}</div><div>${res.map((r) => r.html).join('')}</div></div>`;
  } catch (e: any) {
    out.innerHTML = `<p class="src">Could not complete the recomputation: ${esc(String(e?.message ?? e))}</p>`;
  } finally { go.disabled = tb.disabled = false; }
}

export function initWatcher(c: Ctx) {
  ctx = c;
  $('watch-intro').textContent = 'The proposal pins the URL and the SHA-256 of the exact response the root was built from. This button fetches each pinned URL in your browser, hashes the bytes, rebuilds the tree with the same code the operators use, and compares the result with the epoch file and with the registry on chain, for the active root and for a pending one.';
  $('watch-go').addEventListener('click', () => run(false));
  $('watch-tamper').addEventListener('click', () => run(true));
}
