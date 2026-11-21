import { describe, it, expect } from 'vitest';
import { MerkleTree, rootFromProof, leafHash, leafKey, u64le, bytesToHex, type Entry } from '../src/merkle.js';

const entry = (i: number, cumulative = BigInt(i + 1), method: 0 | 1 = 0): Entry => ({ method, identity: Uint8Array.from({ length: method ? 20 : 25 }, (_, k) => (k < 4 ? (i >> (8 * k)) & 0xff : 0x5a)), cumulative });
const many = (n: number) => Array.from({ length: n }, (_, i) => entry(i));

describe('Merkle tree', () => {
  it('builds proofs that recompute the root for every leaf, depth 9 for 300 leaves', () => {
    const entries = many(300);
    const tree = new MerkleTree(entries);
    expect(tree.depth).toBe(9);
    for (let i = 0; i < entries.length; i++) expect(bytesToHex(rootFromProof(entries[i], tree.proof(i)))).toBe(bytesToHex(tree.root));
  });
  it('a one-leaf tree has depth 0 and an empty proof', () => {
    const tree = new MerkleTree([entry(0)]);
    expect(tree.depth).toBe(0);
    expect(bytesToHex(rootFromProof(tree.entries[0], tree.proof(0)))).toBe(bytesToHex(tree.root));
  });
  it('changing any single field of any leaf changes the root', () => {
    const base = many(9);
    const root = bytesToHex(new MerkleTree(base).root);
    for (const mutate of [
      (e: Entry) => ({ ...e, cumulative: e.cumulative + 1n }),
      (e: Entry) => ({ ...e, method: (e.method ^ 1) as 0 | 1 }),
      (e: Entry) => ({ ...e, identity: Uint8Array.from(e.identity, (b, k) => (k === e.identity.length - 1 ? b ^ 1 : b)) }),
    ]) for (let i = 0; i < base.length; i++) {
      const t = base.map((e, j) => (i === j ? mutate(e) : e));
      expect(bytesToHex(new MerkleTree(t).root), `leaf ${i}`).not.toBe(root);
    }
  });
  it('refuses duplicate identities, empty input and bad indexes', () => {
    expect(() => new MerkleTree([entry(1), entry(1, 99n)])).toThrow(/duplicate/);
    expect(() => new MerkleTree([])).toThrow();
    const tree = new MerkleTree(many(5));
    expect(() => tree.proof(5)).toThrow(RangeError);
    expect(() => tree.proof(-1)).toThrow(RangeError);
  });
  it('a proof does not verify another leaf, another index, or an index beyond the depth', () => {
    const tree = new MerkleTree(many(8));
    const p = tree.proof(3);
    expect(bytesToHex(rootFromProof(tree.entries[4], p))).not.toBe(bytesToHex(tree.root));
    expect(bytesToHex(rootFromProof(tree.entries[3], { ...p, index: 2 }))).not.toBe(bytesToHex(tree.root));
    expect(() => rootFromProof(tree.entries[3], { ...p, index: 3 + 8 })).toThrow(RangeError);
  });
  it('the same identity under two methods is two different leaves', () => {
    const id = Uint8Array.from({ length: 20 }, (_, i) => i);
    const a: Entry = { method: 0, identity: id, cumulative: 5n };
    const b: Entry = { method: 1, identity: id, cumulative: 5n };
    expect(bytesToHex(leafHash(a))).not.toBe(bytesToHex(leafHash(b)));
    expect(bytesToHex(leafKey(a))).not.toBe(bytesToHex(leafKey(b)));
    expect(() => new MerkleTree([a, b])).not.toThrow();
  });
  it('encodes the cumulative total as the 8 byte little endian number the contract hashes', () => {
    expect(bytesToHex(u64le(0n))).toBe('0000000000000000');
    expect(bytesToHex(u64le(0x0102n))).toBe('0201000000000000');
    expect(() => u64le(-1n)).toThrow(RangeError);
    expect(() => u64le(1n << 63n)).toThrow(RangeError);
  });
});
