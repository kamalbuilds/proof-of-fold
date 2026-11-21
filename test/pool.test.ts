import { describe, it, expect } from 'vitest';
import { SignatureTemplate } from '@solidcash/solidcash';
import { setup, publish, claim, claimKey, tokensAt, outcome, MerkleTree, mine, hexToBin, ASSET, OTHER, POOL_TOKENS, PUSH_DELAY, leafKey, p2pkhLock, sig, ecdsa, withRelativeLock } from './helpers.js';
import { u64le } from '../src/merkle.js';

const tree0 = (c: Awaited<ReturnType<typeof setup>>) => new MerkleTree(c.entries);

describe('FoldClaimPool: method 0 (BCH address leaf)', () => {
  it('pays a leaf once, to its own address, whoever submits, and funds from the container', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    expect(String(await c.pool.tokens[ASSET].amount)).toBe(String(POOL_TOKENS));
    await claim(c, c.mallory, tree, 0);                       // a stranger relays Alice's claim
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
    expect(String(await c.pool.tokens[ASSET].amount)).toBe(String(POOL_TOKENS - 5_000n));
    expect(await tokensAt(c, c.mallory.getLockingBytecode())).toBe(0n);
    expect(await outcome(claim(c, c.alice, tree, 0))).toMatch(/NothingToClaim|nothing|require/i);
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
  });

  it('refuses every forged claim and pays nobody', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    const mallory = c.mallory.getLockingBytecode();
    const bobsProof = tree.proof(1).proofBytes;
    const forged: [string, () => Promise<unknown>][] = [
      ['proof of Bob, paid to Mallory', () => claim(c, c.mallory, tree, 1, { identity: mallory })],
      ['inflated amount', () => claim(c, c.mallory, tree, 1, { cumulative: 1_000_000n })],
      ['wrong index', () => claim(c, c.mallory, tree, 1, { index: 3n })],
      ['index beyond the tree', () => claim(c, c.mallory, tree, 1, { index: 1n + 16n })],
      ['negative index', () => claim(c, c.mallory, tree, 1, { index: -1n })],
      ['truncated proof', () => claim(c, c.mallory, tree, 1, { proof: bobsProof.slice(0, 64) })],
      ['proof not a multiple of 32', () => claim(c, c.mallory, tree, 1, { proof: bobsProof.slice(0, 70) })],
      ['another token category', () => claim(c, c.mallory, tree, 1, { category: OTHER })],
      ["someone else's receipt key", () => claim(c, c.mallory, tree, 1, { leafKey: leafKey(tree.entries[0]) })],
      ['a method 1 leaf claimed as method 0', () => claim(c, c.mallory, tree, 2, { identity: tree.entries[2].identity })],
    ];
    for (const [label, p] of forged) expect(await outcome(p()), label).not.toBe('accepted');
    expect(await tokensAt(c, mallory)).toBe(0n);
    expect(await tokensAt(c, c.entries[1].identity)).toBe(0n);
    expect(String(await c.pool.tokens[ASSET].amount)).toBe(String(POOL_TOKENS));
  });

  it('refuses a proof deeper than 24 levels', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    const deep = new Uint8Array(25 * 32);
    deep.set(tree.proof(0).proofBytes);
    expect(await outcome(claim(c, c.mallory, tree, 0, { proof: deep }))).not.toBe('accepted');
  });

  it('pays only the difference under a newer cumulative root, and users can skip epochs', async () => {
    const c = await setup();
    const t1 = tree0(c);
    await publish(c, t1, 1n);
    await claim(c, c.mallory, t1, 0);                                         // Alice takes 5,000 in epoch 1
    const e2 = c.entries.map((e, i) => ({ ...e, cumulative: e.cumulative + (i === 0 ? 3_000n : 100n) }));
    const t2 = new MerkleTree(e2);
    await publish(c, t2, 2n);
    await claim(c, c.mallory, t2, 0);                                         // epoch 2: only +3,000
    expect(await tokensAt(c, c.entries[0].identity)).toBe(8_000n);
    // Bob never claimed epoch 1 and takes his whole cumulative total now
    await claim(c, c.mallory, t2, 1);
    expect(await tokensAt(c, c.entries[1].identity)).toBe(12_445n);
    // the epoch 1 proof no longer matches the active root
    expect(await outcome(claim(c, c.mallory, t1, 3))).not.toBe('accepted');
  });

  it('a lower cumulative total than already paid pays nothing', async () => {
    const c = await setup();
    const t1 = tree0(c);
    await publish(c, t1, 1n);
    await claim(c, c.mallory, t1, 0);
    const dip = c.entries.map((e, i) => ({ ...e, cumulative: i === 0 ? 4_000n : e.cumulative }));
    const t2 = new MerkleTree(dip);
    await publish(c, t2, 2n);
    expect(await outcome(claim(c, c.mallory, t2, 0))).not.toBe('accepted');
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
  });

  it('never reads a pending root: nothing to sync, and claims verify against the active root only', async () => {
    const c = await setup();
    const t1 = tree0(c);
    expect(await outcome(c.pool.connect(c.mallory).call.syncRoot().send())).not.toBe('accepted'); // nothing active yet
    await publish(c, t1, 1n);
    const t2 = new MerkleTree(c.entries.map((e) => ({ ...e, cumulative: e.cumulative + 7n })));
    await c.registry.call.proposeRoot(ecdsa(c.op1), ecdsa(c.op2), t2.root, new Uint8Array(32), 2n).send();
    expect(await outcome(c.pool.connect(c.mallory).call.syncRoot().send())).not.toBe('accepted');  // epoch 2 is only pending
    expect(await outcome(claim(c, c.mallory, t2, 0))).not.toBe('accepted');                       // t2 leaf is not in the active root
    expect(await outcome(claim(c, c.mallory, t1, 0))).toBe('accepted');
  });

  it('refuses a claim larger than the pool holds', async () => {
    const c = await setup();
    const rich = c.entries.map((e, i) => ({ ...e, cumulative: i === 0 ? POOL_TOKENS + 1n : e.cumulative }));
    const tree = new MerkleTree(rich);
    await publish(c, tree, 1n);
    expect(await outcome(claim(c, c.mallory, tree, 0))).not.toBe('accepted');
    expect(await tokensAt(c, rich[0].identity)).toBe(0n);
  });
});

describe('FoldClaimPool: method 1 (legacy key leaf)', () => {
  it('pays the destination the key owner chose, and only once', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    const dest = c.dest.getLockingBytecode();
    await claimKey(c, c.mallory, tree, 2, c.legacy[0], dest);                // Mallory only pays the fee: the key signs
    expect(await tokensAt(c, dest)).toBe(70_000n);
    expect(await tokensAt(c, p2pkhLock(c.legacy[0].pkh))).toBe(0n);          // nothing at the legacy hash itself
    expect(await outcome(claimKey(c, c.mallory, tree, 2, c.legacy[0], dest))).not.toBe('accepted');
    expect(await tokensAt(c, dest)).toBe(70_000n);
  });

  it('refuses a stranger: wrong key, a signature from another key, a method 0 leaf, wrong receipt key', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    const dest = c.mallory.getLockingBytecode();
    const stranger = { privateKey: c.mallory.privateKey, publicKey: new SignatureTemplate(c.mallory.privateKey).publicKey };
    const forged: [string, () => Promise<unknown>][] = [
      ['stranger key for a legacy leaf', () => claimKey(c, c.mallory, tree, 2, stranger, dest)],
      ["legacy pubkey, stranger's signature", () => claimKey(c, c.mallory, tree, 2, c.legacy[0], dest, { signWith: c.mallory.privateKey })],
      ["another legacy leaf's receipt key", () => claimKey(c, c.mallory, tree, 2, c.legacy[0], dest, { leafKey: leafKey(tree.entries[3]) })],
      ['inflated amount', () => claimKey(c, c.mallory, tree, 2, c.legacy[0], dest, { cumulative: 9_999_999n })],
      ['the key of a leaf it does not own', () => claimKey(c, c.mallory, tree, 3, c.legacy[0], dest)],
      ['wrong token', () => claimKey(c, c.mallory, tree, 2, c.legacy[0], dest, { category: OTHER })],
    ];
    for (const [label, p] of forged) expect(await outcome(p()), label).not.toBe('accepted');
    expect(await tokensAt(c, dest)).toBe(0n);
  });

  it('a BCH-address leaf cannot be claimed through the key path', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    const k = { privateKey: c.alice.privateKey, publicKey: new SignatureTemplate(c.alice.privateKey).publicKey };
    expect(await outcome(claimKey(c, c.alice, tree, 0, k, c.alice.getLockingBytecode()))).not.toBe('accepted');
  });
});

describe('FoldClaimPool: operator push', () => {
  const push = (c: any, by: any, tree: MerkleTree, index: number, o: { sigBy?: any } = {}) => {
    const e = tree.entries[index];
    const call = c.pool.connect(by).call.push(
      sig(o.sigBy ?? by), hexToBin(ASSET), Uint8Array.of(e.method), e.identity, leafKey(e), e.cumulative,
      tree.proof(index).proofBytes, BigInt(index),
    );
    // The destination of a method 1 leaf is built inside the contract, so the SDK is told it.
    if (e.method === 1) call.tokenContainerTransfer(ASSET, p2pkhLock(e.identity), e.cumulative);
    return call.send();
  };
  const openWindow = async (c: any) => {
    await mine(PUSH_DELAY + 5);
    await withRelativeLock(c.registry.categoryId, PUSH_DELAY, () => c.registry.call.openPush().send());
    await c.pool.connect(c.op1).call.syncRoot().send();
  };

  it('is refused until the registry has opened the push window for the pool epoch', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    expect(await outcome(push(c, c.op1, tree, 1))).not.toBe('accepted');
    expect(await tokensAt(c, c.entries[1].identity)).toBe(0n);
  });

  it('pays leaves that never claimed to their own identity, and refuses small payouts and outsiders', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    await openWindow(c);
    expect(await outcome(push(c, c.mallory, tree, 1))).not.toBe('accepted');                  // not the operator
    expect(await outcome(push(c, c.mallory, tree, 1, { sigBy: c.mallory }))).not.toBe('accepted');
    expect(await outcome(push(c, c.op1, tree, 4))).not.toBe('accepted');                      // 999 is under MIN_PUSH
    expect(await outcome(push(c, c.op1, tree, 1))).toBe('accepted');                          // method 0 leaf: its locking bytecode
    expect(await tokensAt(c, c.entries[1].identity)).toBe(12_345n);
    expect(await outcome(push(c, c.op1, tree, 2))).toBe('accepted');                          // method 1 leaf: P2PKH of its hash160
    expect(await tokensAt(c, p2pkhLock(c.legacy[0].pkh))).toBe(70_000n);
    // the receipt is shared: neither a second push nor the owner's own claim pays again
    expect(await outcome(push(c, c.op1, tree, 1))).not.toBe('accepted');
    expect(await outcome(claim(c, c.bob, tree, 1))).not.toBe('accepted');
    expect(await tokensAt(c, c.entries[1].identity)).toBe(12_345n);
  });

  it('a leaf that claimed itself cannot be pushed again', async () => {
    const c = await setup();
    const tree = tree0(c);
    await publish(c, tree, 1n);
    await claim(c, c.mallory, tree, 0);
    await openWindow(c);
    expect(await outcome(push(c, c.op1, tree, 0))).not.toBe('accepted');
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
  });

  it('the window belongs to one epoch: a newer synced epoch closes it until the registry reopens', async () => {
    const c = await setup();
    const t1 = tree0(c);
    await publish(c, t1, 1n);
    await openWindow(c);
    const t2 = new MerkleTree(c.entries.map((e) => ({ ...e, cumulative: e.cumulative + 5_000n })));
    await publish(c, t2, 2n);
    expect(await outcome(push(c, c.op1, t2, 1))).not.toBe('accepted');   // the window is open for epoch 1, the pool is on epoch 2
  });
});
