/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any, max-len */
import { hash160, hexToBin } from '@bitauth/libauth';
import { SignatureTemplate, SighashType, SignatureAlgorithm } from '@solidcash/solidcash';
import { StatefulContract, getDataNftLockingBytecode } from '@solidcash/solidcash/stateful';
import { compileFile } from '@solidcash/solidc';
import { ethers } from '@solidcash/testing';
import { mine } from '@nomicfoundation/hardhat-network-helpers';
import { MerkleTree, leafKey, type Entry } from '../../merkle_pull_claim/merkle.js';

// A registry publishes a Merkle root only after a public audit window; a pool pays any leaf of the active root once.
// The window is `require(this.age >= rootDelay)` in the registry, so activating needs the registry's master input to carry an
// nSequence of rootDelay (144 here): the call sets it with `setSequence`, and the chain refuses anything shorter.
const registryArtifact = compileFile(new URL('../../merkle_pull_claim/RootRegistry.scash', import.meta.url));
const poolArtifact = compileFile(new URL('../../merkle_pull_claim/FoldClaimPool.scash', import.meta.url));

const ROOT_DELAY = 144;                    // the audit window, a constructor argument of the registry
const PUSH_DELAY = 4032;
const ASSET = 'f01dca5ef01dca5ef01dca5ef01dca5ef01dca5ef01dca5ef01dca5ef01dca5e';
const OTHER = 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const POOL_TOKENS = 1_000_000_000n;
const SNAPSHOT = new Uint8Array(32).fill(0x11);

const ecdsa = (s: { privateKey: Uint8Array }) => new SignatureTemplate(s.privateKey, SighashType.SIGHASH_ALL, SignatureAlgorithm.ECDSA);
const outcome = (p: Promise<unknown>) => p.then(() => 'accepted', (e: any) => String(e?.message ?? e));
const p2pkhLock = (pkh: Uint8Array) => Uint8Array.of(0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac);
/** A folder nobody holds a key for: a leaf that only the claim path can pay. */
const filler = (seed: number) => p2pkhLock(Uint8Array.of(seed, 0xf0, 0x1d, ...new Array(17).fill(0xfc)));

async function setup() {
  const [op1, op2, op3, guardian, alice, bob, mallory, dest] = await ethers.getSigners(8);
  const provider: any = op1.provider;
  const registry: any = await (await ethers.getContractFactory(registryArtifact, op1))
    .deploy(op1.publicKey, op2.publicKey, op3.publicKey, guardian.publicKey, BigInt(ROOT_DELAY), BigInt(PUSH_DELAY));
  await registry.waitForDeployment();

  const tokenCoin = { txid: 'c'.repeat(64), vout: 0, satoshis: 1_200n, token: { category: ASSET, amount: POOL_TOKENS } };
  await provider.addUtxo(op1.getAddress(), tokenCoin);
  const registryData = getDataNftLockingBytecode(registry.categoryId, hexToBin(registry.inner.lockingBytecode));
  const genesis = (await op1.getUtxos()).find((u: any) => u.vout === 0 && !u.token && u.satoshis >= 200_000n);
  const { contract: deployed } = await StatefulContract.deploy(poolArtifact, [hexToBin(ASSET), registryData, op1.publicKey], {
    provider, fundingUtxo: genesis, funder: op1.unlockP2PKH(), changeAddress: op1.getAddress(),
  } as any) as any;
  const pool: any = StatefulContract.withCategory(deployed.inner, deployed.categoryId, {
    externalContracts: {
      IRootRegistry: {
        artifact: registry.inner.artifact,
        categoryId: registry.categoryId,
        constructorArgs: [op1.publicKey, op2.publicKey, op3.publicKey, guardian.publicKey, BigInt(ROOT_DELAY), BigInt(PUSH_DELAY)],
      },
    },
  } as any);
  await pool.connect(op1).call.fund(hexToBin(ASSET)).tokenContainerDeposit(ASSET, POOL_TOKENS).addInput(tokenCoin, op1.unlockP2PKH()).send();

  // Two folders paid to a BCH address (method 0), one legacy key (method 1), then fillers that fill out the tree.
  const privateKey = new Uint8Array(32).fill(0x40);
  const legacy = { privateKey, publicKey: new SignatureTemplate(privateKey).publicKey };
  const entries: Entry[] = [
    { method: 0, identity: alice.getLockingBytecode(), cumulative: 5_000n },
    { method: 0, identity: bob.getLockingBytecode(), cumulative: 12_345n },
    { method: 1, identity: hash160(legacy.publicKey), cumulative: 70_000n },
    ...Array.from({ length: 5 }, (_, i) => ({ method: 0 as const, identity: filler(i), cumulative: BigInt(1000 + i) })),
  ];
  return { op1, op2, op3, guardian, alice, bob, mallory, dest, provider, registry, pool, legacy, entries };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const tokensAt = async (c: Ctx, lockingBytecode: Uint8Array) => {
  const utxos = await c.provider.getUtxosForLockingBytecode(lockingBytecode);
  return utxos.filter((u: any) => u.token?.category === ASSET).reduce((n: bigint, u: any) => n + u.token.amount, 0n);
};

const propose = (c: Ctx, tree: MerkleTree, epoch: bigint) =>
  c.registry.call.proposeRoot(ecdsa(c.op1), ecdsa(c.op2), tree.root, SNAPSHOT, epoch).send();
const activate = (c: Ctx, blocks = ROOT_DELAY) => c.registry.call.activateRoot().setSequence(blocks).send();

/** Propose, wait out the audit window, activate, and sync the pool. */
async function publish(c: Ctx, tree: MerkleTree, epoch: bigint) {
  await propose(c, tree, epoch);
  await mine(ROOT_DELAY);
  for (let extra = 0; ; extra++) { // the mock confirms the proposal one block late
    try { await activate(c); break; } catch (e: any) {
      if (!/BIP68/.test(String(e?.message)) || extra >= 4) throw e;
      await mine(1);
    }
  }
  await c.pool.connect(c.op1).call.syncRoot().send();
}

type Forged = Partial<{ category: string; identity: Uint8Array; leafKey: Uint8Array; cumulative: bigint; proof: Uint8Array; index: bigint }>;
/** Method 0 claim for entries[index]; any argument may be forged through `o`. */
const claim = (c: Ctx, by: any, tree: MerkleTree, index: number, o: Forged = {}) => {
  const e = tree.entries[index];
  const identity = o.identity ?? e.identity;
  return c.pool.connect(by).call.claim(
    hexToBin(o.category ?? ASSET), identity, o.leafKey ?? leafKey({ method: 0, identity }), o.cumulative ?? e.cumulative,
    o.proof ?? tree.proof(index), o.index ?? BigInt(index),
  ).send();
};
/** Method 1 claim: the key behind the legacy address signs and names the destination. */
const claimWithKey = (c: Ctx, by: any, tree: MerkleTree, index: number, key: { privateKey: Uint8Array; publicKey: Uint8Array },
  destination: Uint8Array, o: Forged = {}) => {
  const e = tree.entries[index];
  return c.pool.connect(by).call.claimWithKey(
    new SignatureTemplate(key.privateKey), key.publicKey, hexToBin(o.category ?? ASSET), destination, o.leafKey ?? leafKey(e),
    o.cumulative ?? e.cumulative, o.proof ?? tree.proof(index), o.index ?? BigInt(index),
  ).send();
};

describe('RootRegistry: the audit window is enforced by the chain', () => {
  it('activates only once the registry UTXO is ROOT_DELAY blocks old, and no shorter sequence passes', async () => {
    const c = await setup();
    await propose(c, new MerkleTree(c.entries), 1n);

    expect(await outcome(activate(c))).toMatch(/BIP68/);                                  // right sequence, too young
    await mine(ROOT_DELAY + 5);
    expect(await outcome(activate(c, ROOT_DELAY - 1))).toMatch(/OP_CHECKSEQUENCEVERIFY/); // shorter than the contract asks
    expect((await c.registry.getState()).activeEpoch).toBe(0n);

    expect(await outcome(activate(c))).toBe('accepted');
    expect((await c.registry.getState()).activeEpoch).toBe(1n);
  });

  it('lets the guardian cancel a pending root, which the pool then never sees', async () => {
    const c = await setup();
    await propose(c, new MerkleTree(c.entries), 1n);
    await c.registry.call.cancelPending(new SignatureTemplate(c.guardian.privateKey, SighashType.SIGHASH_ALL, SignatureAlgorithm.ECDSA)).send();
    await mine(ROOT_DELAY + 5);
    expect(await outcome(activate(c))).not.toBe('accepted');
    expect(await outcome(c.pool.connect(c.mallory).call.syncRoot().send())).not.toBe('accepted');
  });
});

describe('FoldClaimPool: pull claims against the active root', () => {
  it('pays a method 0 leaf once, to its own address, whoever submits it', async () => {
    const c = await setup();
    const tree = new MerkleTree(c.entries);
    await publish(c, tree, 1n);

    await claim(c, c.mallory, tree, 0);                                      // a stranger relays Alice's claim
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
    expect(await tokensAt(c, c.mallory.getLockingBytecode())).toBe(0n);
    expect(String(await c.pool.tokens[ASSET].amount)).toBe(String(POOL_TOKENS - 5_000n));

    expect(await outcome(claim(c, c.alice, tree, 0))).not.toBe('accepted');   // the receipt blocks a second claim
    expect(await tokensAt(c, c.entries[0].identity)).toBe(5_000n);
  });

  it('refuses every forged claim and pays nobody', async () => {
    const c = await setup();
    const tree = new MerkleTree(c.entries);
    await publish(c, tree, 1n);
    const mallory = c.mallory.getLockingBytecode();
    const forged: [string, () => Promise<unknown>][] = [
      ["Bob's proof, paid to Mallory", () => claim(c, c.mallory, tree, 1, { identity: mallory })],
      ['inflated amount', () => claim(c, c.mallory, tree, 1, { cumulative: 1_000_000n })],
      ['wrong index', () => claim(c, c.mallory, tree, 1, { index: 3n })],
      ['truncated proof', () => claim(c, c.mallory, tree, 1, { proof: tree.proof(1).slice(0, 64) })],
      ['proof not a multiple of 32', () => claim(c, c.mallory, tree, 1, { proof: tree.proof(1).slice(0, 70) })],
      ['another token category', () => claim(c, c.mallory, tree, 1, { category: OTHER })],
      ["someone else's receipt key", () => claim(c, c.mallory, tree, 1, { leafKey: leafKey(tree.entries[0]) })],
      ['a method 1 leaf claimed as method 0', () => claim(c, c.mallory, tree, 2)],
    ];
    for (const [label, send] of forged) expect(await outcome(send()), label).not.toBe('accepted');
    expect(await tokensAt(c, mallory)).toBe(0n);
    expect(await tokensAt(c, c.entries[1].identity)).toBe(0n);
    expect(String(await c.pool.tokens[ASSET].amount)).toBe(String(POOL_TOKENS));
  });

  it('pays only the difference under a newer cumulative root, and a folder may skip an epoch', async () => {
    const c = await setup();
    const t1 = new MerkleTree(c.entries);
    await publish(c, t1, 1n);
    await claim(c, c.mallory, t1, 0);                                        // Alice takes 5,000 in epoch 1
    const t2 = new MerkleTree(c.entries.map((e, i) => ({ ...e, cumulative: e.cumulative + (i === 0 ? 3_000n : 100n) })));
    await publish(c, t2, 2n);
    await claim(c, c.mallory, t2, 0);                                        // epoch 2: only the 3,000 more
    await claim(c, c.mallory, t2, 1);                                        // Bob skipped epoch 1 and takes it all
    expect(await tokensAt(c, c.entries[0].identity)).toBe(8_000n);
    expect(await tokensAt(c, c.entries[1].identity)).toBe(12_445n);
    expect(await outcome(claim(c, c.mallory, t1, 3))).not.toBe('accepted');  // an epoch 1 proof no longer matches
  });

  it('pays a method 1 leaf to the destination its key signs for, and refuses another key', async () => {
    const c = await setup();
    const tree = new MerkleTree(c.entries);
    await publish(c, tree, 1n);
    const stranger = { privateKey: c.mallory.privateKey, publicKey: new SignatureTemplate(c.mallory.privateKey).publicKey };
    const dest = c.dest.getLockingBytecode();

    expect(await outcome(claimWithKey(c, c.mallory, tree, 2, stranger, c.mallory.getLockingBytecode()))).not.toBe('accepted');
    expect(await tokensAt(c, c.mallory.getLockingBytecode())).toBe(0n);

    await claimWithKey(c, c.mallory, tree, 2, c.legacy, dest);               // Mallory pays the fee, the legacy key signs
    expect(await tokensAt(c, dest)).toBe(70_000n);
    expect(await outcome(claimWithKey(c, c.mallory, tree, 2, c.legacy, dest))).not.toBe('accepted');
  });
});
