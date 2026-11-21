import { describe, it, expect } from 'vitest';
import { setup, publish, claim, claimKey, tokensAt, outcome, MerkleTree, mine } from './helpers.js';

describe('FoldClaimPool: happy paths', () => {
  it('pays a BCH-address leaf once, to its own address, whoever submits', async () => {
    const c = await setup();
    const tree = new MerkleTree(c.entries);
    await publish(c, tree, 1n);
    await claim(c, c.mallory, tree, 0);                       // a stranger relays Alice's claim
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
    expect(await outcome(claim(c, c.alice, tree, 0))).not.toBe('accepted');
  });
  it('pays a legacy-key leaf to the destination its key owner chose', async () => {
    const c = await setup();
    const tree = new MerkleTree(c.entries);
    await publish(c, tree, 1n);
    const dest = c.dest.getLockingBytecode();
    await claimKey(c, c.mallory, tree, 2, c.legacy[0], dest);
    expect(await tokensAt(c, dest)).toBe(70_000n);
  });
});
