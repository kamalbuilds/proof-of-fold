// The proof plate: a Merkle path drawn as SVG, leaf at the bottom, each sibling joining on the way up to the root.
// Verify recomputes every level with sha256 in the page and compares the result to the roots it was given.
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { leafHash, rootFromProof, bytesToHex, type Entry } from '../../src/merkle.ts';
import { $, esc, shortHex, sleep } from './chain.ts';

export type PlateSel = {
  title: string;
  entry: Entry; index: number; siblings: Uint8Array[];
  /** Roots the recomputed root is compared against, labelled by where they were read. */
  refs: { label: string; root: string }[];
};

const W = 360, CX = 180, DX = 100, NW = 80, NH = 26, ROW = 56, TOP = 34, BOT = 14;
const hex = (b: Uint8Array) => bytesToHex(b);
const nodeHash = (l: Uint8Array, r: Uint8Array) => sha256(concatBytes(Uint8Array.of(0x01), l, r));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let sel: PlateSel | undefined;
let running = false;

const svg = () => $('plate-svg') as unknown as SVGSVGElement;
const depthOf = () => sel!.siblings.length;
const yOf = (k: number) => TOP + (depthOf() - k) * ROW + NH / 2;

function node(id: string, cls: string, x: number, y: number, text: string, full: string) {
  return `<g class="nd ${cls}" id="${id}" data-hex="${full}" tabindex="0" role="button" aria-label="${esc(cls)} node ${text}"><rect x="${x - NW / 2}" y="${y - NH / 2}" width="${NW}" height="${NH}" rx="2"/><text x="${x}" y="${y + 4}" text-anchor="middle">${text}</text></g>`;
}

function draw() {
  const s = sel!;
  const d = depthOf();
  const H = TOP + d * ROW + NH + BOT;
  svg().setAttribute('viewBox', `0 0 ${W} ${H}`);
  let edges = '', nodes = '', tags = '';
  const leaf = hex(leafHash(s.entry));
  for (let k = 0; k <= d; k++) {
    const y = yOf(k);
    const tag = k === 0 ? 'leaf' : k === d ? 'root' : `L${k}`;
    tags += `<text class="tag-svg" x="2" y="${y + 4}">${tag}</text>`;
    if (k < d) {
      const pos = s.index >> k;
      const side = pos % 2 === 0 ? 1 : -1;
      const sx = CX + side * DX;
      const sib = hex(s.siblings[k]);
      const ym = y - ROW / 2;
      edges += `<path class="edge" d="M${sx} ${y - NH / 2} V${ym} H${CX}"/>`;
      edges += `<path class="edge path anim" id="es-${k}" pathLength="1" d="M${sx} ${y - NH / 2} V${ym} H${CX}"/>`;
      edges += `<path class="edge" d="M${CX} ${y - NH / 2} V${yOf(k + 1) + NH / 2}"/>`;
      edges += `<path class="edge path anim" id="ep-${k}" pathLength="1" d="M${CX} ${y - NH / 2} V${yOf(k + 1) + NH / 2}"/>`;
      nodes += node(`sib-${k}`, 'sib', sx, y, sib.slice(0, 8), sib);
    }
    if (k === 0) nodes += node('p-0', 'leaf', CX, y, leaf.slice(0, 8), leaf);
    else nodes += node(`p-${k}`, `pathnode ${k === d ? 'root' : ''}`, CX, y, '\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7', '');
  }
  svg().innerHTML = edges + tags + nodes;
  svg().setAttribute('aria-label', `Merkle proof path for ${s.title}: ${d} sibling hashes from the leaf to the root`);
}

function renderRefs(results?: { label: string; root: string; ok: boolean }[]) {
  const s = sel!;
  $('plate-refs').innerHTML = s.refs.map((r, i) => {
    const res = results?.[i];
    const cls = res ? (res.ok ? 'ok' : 'bad') : '';
    return `<li class="${cls}"><span class="k">${esc(r.label)}</span><span class="v mono">${shortHex(r.root, 12, 8)}</span><span class="tag">${res ? (res.ok ? 'MATCH' : 'MISMATCH') : ''}</span></li>`;
  }).join('');
}

export function select(next: PlateSel) {
  sel = next;
  draw();
  renderRefs();
  $('plate-sub').textContent = next.title;
  $('plate-note').textContent = 'Each sibling hash joins on the way up. node = sha256(01 | left | right).';
  $('inspect-hex').textContent = 'Press a node to read its full hash.';
  ($('verify') as HTMLButtonElement).disabled = false;
  ($('verify-reset') as HTMLButtonElement).disabled = true;
}

export function reset() {
  if (!sel || running) return;
  draw();
  renderRefs();
  $('plate-note').textContent = 'Each sibling hash joins on the way up. node = sha256(01 | left | right).';
  ($('verify-reset') as HTMLButtonElement).disabled = true;
}

const el = (id: string) => svg().querySelector('#' + id) as SVGGElement;

export async function verify(): Promise<{ root: string; ok: boolean }> {
  if (!sel || running) throw new Error('nothing to verify');
  running = true;
  const step = reduced() ? 0 : 340;
  const s = sel;
  const verifyBtn = $('verify') as HTMLButtonElement;
  verifyBtn.disabled = true;
  draw();
  renderRefs();
  const d = depthOf();
  let h = leafHash(s.entry);
  try {
    for (let k = 0; k < d; k++) {
      const sib = s.siblings[k];
      const right = (s.index >> k) % 2 === 1;
      el(`sib-${k}`).classList.add('hot');
      $('plate-note').textContent = `L${k} to L${k + 1}: sha256(01 | ${right ? 'sibling | node' : 'node | sibling'})`;
      await sleep(step);
      h = right ? nodeHash(sib, h) : nodeHash(h, sib);
      svg().querySelector(`#es-${k}`)!.classList.add('on');
      svg().querySelector(`#ep-${k}`)!.classList.add('on');
      await sleep(step);
      const out = el(`p-${k + 1}`);
      out.dataset.hex = hex(h);
      out.querySelector('text')!.textContent = hex(h).slice(0, 8);
      out.classList.add('done');
      el(`sib-${k}`).classList.remove('hot');
      await sleep(step / 2);
    }
    const root = hex(h);
    // The page's own check that the animation and the shared library agree.
    if (root !== hex(rootFromProof(s.entry, { index: s.index, siblings: s.siblings }))) throw new Error('plate recomputation disagrees with rootFromProof');
    const results = s.refs.map((r) => ({ ...r, ok: r.root === root }));
    const all = results.length > 0 && results.every((r) => r.ok);
    const rootNode = el(`p-${d}`);
    rootNode.classList.add(all ? 'ok' : 'bad');
    renderRefs(results);
    $('plate-note').textContent = all ? `root ${shortHex(root, 12, 8)} equals every root it is compared with` : `root ${shortHex(root, 12, 8)} differs from at least one compared root`;
    ($('verify-reset') as HTMLButtonElement).disabled = false;
    return { root, ok: all };
  } finally {
    running = false;
    verifyBtn.disabled = false;
  }
}

export function initPlate() {
  svg().addEventListener('click', (e) => inspect(e.target as Element));
  svg().addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(e.target as Element); } });
  $('verify').addEventListener('click', () => { verify().catch((err) => { $('plate-note').textContent = String(err.message ?? err); }); });
  $('verify-reset').addEventListener('click', reset);
}
function inspect(t: Element) {
  const g = t.closest('[data-hex]') as SVGGElement | null;
  if (!g) return;
  $('inspect-hex').textContent = g.dataset.hex || 'not computed yet: press Verify path';
}
