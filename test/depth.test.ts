// Claim size against proof depth under production limits (10,000 byte input scripts, 100,000 byte transactions,
// dust and relay rules). Every depth is a real claim that the mock network accepts. Depths above 16 use a sparse path:
// the contract only hashes the siblings it is given, so real siblings or fabricated ones measure the same bytes.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { setup, publish, claimKey, tokensAt, MerkleTree, bytesToHexLocal } from './helpers.js';
import { leafHash, bytesToHex, type Entry } from '../src/merkle.js';

const rows: any[] = [];
const node = (l: Uint8Array, r: Uint8Array) => sha256(concatBytes(Uint8Array.of(0x01), l, r));

/** A tree of the given depth that holds one real leaf at index 0 and fabricated siblings. */
function sparse(entry: Entry, depth: number) {
  let h = leafHash(entry);
  const siblings: Uint8Array[] = [];
  for (let l = 0; l < depth; l++) {
    const s = sha256(Uint8Array.of(0xee, l));
    siblings.push(s);
    h = node(h, s);
  }
  return { root: h, proofBytes: concatBytes(...siblings) };
}

describe('claim cost against depth', () => {
  for (const depth of [1, 4, 8, 9, 12, 16, 20, 24]) {
    it(`depth ${depth}: a legacy-key claim fits the production limits`, async () => {
      const c = await setup({ fillers: 0 });
      const entry = c.entries[2];
      const { root, proofBytes } = sparse(entry, depth);
      const tree = { root, entries: [entry], proof: () => ({ proofBytes }) } as unknown as MerkleTree;
      await publish(c, tree, 1n);
      const dest = c.dest.getLockingBytecode();
      const r: any = await claimKey(c, c.mallory, tree, 0, c.legacy[0], dest, { cumulative: entry.cumulative });
      expect(await tokensAt(c, dest)).toBe(entry.cumulative);
      const bytes = r.hex.length / 2;
      rows.push({ depth, leaves: depth === 0 ? 1 : 2 ** depth, claimTxBytes: bytes, txid: r.txid });
      mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
      writeFileSync(new URL('../docs/depth-analysis.json', import.meta.url), JSON.stringify(rows.sort((a, b) => a.depth - b.depth), null, 2) + '\n');
      expect(bytes).toBeLessThan(100_000);
    });
  }
});
