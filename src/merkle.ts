// Merkle tree over FoldingCash payout leaves. Must agree byte for byte with FoldClaimPool.scash.
//   leaf = sha256(0x00 | method | identity | cumulative as 8 bytes big endian)
//   node = sha256(0x01 | left | right), missing leaves are 32 zero bytes, depth = ceil(log2(leaf count)).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';

export type Method = 0 | 1;
/** method 0: identity is a locking bytecode. method 1: identity is the 20 byte hash160 of a public key. */
export type Entry = { method: Method; identity: Uint8Array; cumulative: bigint };
export type Proof = { index: number; siblings: Uint8Array[]; proofBytes: Uint8Array };

const ZERO = new Uint8Array(32);

export function u64be(n: bigint): Uint8Array {
  if (n < 0n || n >= 1n << 64n) throw new RangeError('cumulative must fit in 8 bytes');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n);
  return out;
}

export const leafHash = (e: Entry): Uint8Array =>
  sha256(concatBytes(Uint8Array.of(0x00, e.method), e.identity, u64be(e.cumulative)));
/** The pool's receipt key for a leaf: it does not depend on the cumulative amount. */
export const leafKey = (e: Pick<Entry, 'method' | 'identity'>): Uint8Array =>
  sha256(concatBytes(Uint8Array.of(e.method), e.identity));
const node = (l: Uint8Array, r: Uint8Array): Uint8Array => sha256(concatBytes(Uint8Array.of(0x01), l, r));

export function rootFromProof(e: Entry, p: Pick<Proof, 'index' | 'siblings'>): Uint8Array {
  let h = leafHash(e);
  let pos = p.index;
  for (const s of p.siblings) {
    h = pos % 2 === 0 ? node(h, s) : node(s, h);
    pos = Math.floor(pos / 2);
  }
  if (pos !== 0) throw new RangeError('index out of range for proof depth');
  return h;
}

export class MerkleTree {
  readonly levels: Uint8Array[][];
  constructor(readonly entries: Entry[]) {
    if (entries.length === 0) throw new Error('empty tree');
    const keys = new Set(entries.map((e) => bytesToHex(leafKey(e))));
    if (keys.size !== entries.length) throw new Error('duplicate leaf identity');
    const size = 2 ** Math.max(0, Math.ceil(Math.log2(entries.length)));
    let level = entries.map(leafHash);
    while (level.length < size) level.push(ZERO);
    this.levels = [level];
    while (level.length > 1) {
      const next: Uint8Array[] = [];
      for (let i = 0; i < level.length; i += 2) next.push(node(level[i], level[i + 1]));
      this.levels.push(next);
      level = next;
    }
  }
  get root(): Uint8Array { return this.levels[this.levels.length - 1][0]; }
  get depth(): number { return this.levels.length - 1; }
  proof(index: number): Proof {
    if (!Number.isInteger(index) || index < 0 || index >= this.entries.length) throw new RangeError('no such leaf');
    const siblings: Uint8Array[] = [];
    let pos = index;
    for (let l = 0; l < this.depth; l++) { siblings.push(this.levels[l][pos ^ 1]); pos = Math.floor(pos / 2); }
    return { index, siblings, proofBytes: concatBytes(...siblings) };
  }
  indexOf(e: Pick<Entry, 'method' | 'identity'>): number {
    const k = bytesToHex(leafKey(e));
    return this.entries.findIndex((x) => bytesToHex(leafKey(x)) === k);
  }
}

export { bytesToHex, hexToBytes };
