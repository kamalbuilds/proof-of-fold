import { describe, it, expect } from 'vitest';
import { ethers } from '@solidcash/solidhat/hardhat3';
import { mine } from '@nomicfoundation/hardhat-network-helpers';
import { SignatureTemplate, SighashType, SignatureAlgorithm } from '@solidcash/solidcash';
import { withRelativeLock } from '../src/relative-lock.js';

const ROOT_DELAY = 144;
const PUSH_DELAY = 4032;
const ecdsa = (s: { privateKey: Uint8Array }) => new SignatureTemplate(s.privateKey, SighashType.SIGHASH_ALL, SignatureAlgorithm.ECDSA);
const schnorr = (s: { privateKey: Uint8Array }) => new SignatureTemplate(s.privateKey);
const outcome = (p: Promise<unknown>) => p.then(() => 'accepted', (e: any) => String(e?.message ?? e));
const rootA = new Uint8Array(32).fill(0xaa);
const snapA = new Uint8Array(32).fill(0x5a);

async function setup() {
  const [op1, op2, op3, guardian, mallory] = await ethers.getSigners(5);
  const factory = await ethers.getContractFactory('RootRegistry', op1);
  const registry: any = await factory.deploy(op1.publicKey, op2.publicKey, op3.publicKey, guardian.publicKey, BigInt(ROOT_DELAY), BigInt(PUSH_DELAY));
  await registry.waitForDeployment();
  const lock = (blocks: number, send: () => Promise<unknown>) => withRelativeLock(registry.categoryId, blocks, send);
  const propose = (a: any, b: any, root = rootA, snap = snapA, epoch = 1n) =>
    registry.call.proposeRoot(ecdsa(a), ecdsa(b), root, snap, epoch).send();
  const activate = (blocks = ROOT_DELAY) => lock(blocks, () => registry.call.activateRoot().send());
  return { op1, op2, op3, guardian, mallory, registry, lock, propose, activate };
}

describe('RootRegistry: who may propose', () => {
  it('accepts a proposal signed by two of the three operator keys', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op2);
    const state = await c.registry.getState();
    expect(state.pendingEpoch).toBe(1n);
    expect(state.highEpoch).toBe(1n);
    expect(Number(state.status)).toBe(1);
    const c2 = await setup();
    await c2.propose(c2.op2, c2.op3);
  });

  it('refuses one operator key, an outsider, the guardian, and a repeated key', async () => {
    const c = await setup();
    expect(await outcome(c.propose(c.op1, c.mallory))).not.toBe('accepted');
    expect(await outcome(c.propose(c.mallory, c.op2))).not.toBe('accepted');
    expect(await outcome(c.propose(c.op1, c.guardian))).not.toBe('accepted');
    expect(await outcome(c.propose(c.guardian, c.mallory))).not.toBe('accepted');
    expect(await outcome(c.propose(c.op1, c.op1))).not.toBe('accepted');
    expect(Number((await c.registry.getState()).status)).toBe(0);
  });

  it('refuses Schnorr signatures in the multisig (legacy ECDSA mode only)', async () => {
    const c = await setup();
    expect(await outcome(c.registry.call.proposeRoot(schnorr(c.op1), schnorr(c.op2), rootA, snapA, 1n).send())).not.toBe('accepted');
  });

  it('refuses a second proposal while one is pending, and an epoch that does not increase', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op2);
    expect(await outcome(c.propose(c.op1, c.op2, rootA, snapA, 2n))).toMatch(/AlreadyPending|pending/i);
    await mine(ROOT_DELAY + 2);
    await c.activate();
    expect(await outcome(c.propose(c.op1, c.op2, rootA, snapA, 1n))).toMatch(/EpochNotIncreasing|epoch/i);
    expect(await outcome(c.propose(c.op1, c.op2, rootA, snapA, 2n))).toBe('accepted');
  });
});

describe('RootRegistry: audit window', () => {
  it('activates only after 144 blocks, permissionlessly, and publishes the snapshot hash', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op3);
    expect(await outcome(c.activate())).not.toBe('accepted');          // not even confirmed yet
    await mine(ROOT_DELAY - 1);
    expect(await outcome(c.activate())).not.toBe('accepted');          // 143 blocks: inside the window
    await mine(3);
    expect(await outcome(c.activate())).toBe('accepted');              // 146 blocks: past it (the mock counts the confirming block)
    const state = await c.registry.getState();
    expect(state.activeEpoch).toBe(1n);
    expect(Buffer.from(state.activeRoot).toString('hex')).toBe(Buffer.from(rootA).toString('hex'));
    expect(Buffer.from(state.activeSnapshot).toString('hex')).toBe(Buffer.from(snapA).toString('hex'));
    expect(Number(state.status)).toBe(0);
  });

  it('an operator cannot shorten the window by declaring a smaller age', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op2);
    await mine(21);                                                    // real age 21
    expect(await outcome(c.activate(20))).not.toBe('accepted');        // honest sequence 20: require(this.age >= 144) fails
    expect(await outcome(c.activate(ROOT_DELAY))).not.toBe('accepted'); // sequence 144: the chain refuses (non-BIP68-final)
    await mine(ROOT_DELAY);
    expect(await outcome(c.activate(ROOT_DELAY))).toBe('accepted');
  });

  it('nothing to activate when nothing is pending', async () => {
    const c = await setup();
    await mine(ROOT_DELAY + 1);
    expect(await outcome(c.activate())).not.toBe('accepted');
  });
});

describe('RootRegistry: guardian veto', () => {
  it('the guardian cancels a pending root, the root never activates, and its epoch is burned', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op2);
    await c.registry.call.cancelPending(schnorr(c.guardian)).send();
    expect(Number((await c.registry.getState()).status)).toBe(0);
    await mine(ROOT_DELAY + 1);
    expect(await outcome(c.activate())).not.toBe('accepted');
    expect(await outcome(c.propose(c.op1, c.op2, rootA, snapA, 1n))).not.toBe('accepted'); // epoch 1 is burned
    expect(await outcome(c.propose(c.op1, c.op2, rootA, snapA, 2n))).toBe('accepted');
  });

  it('only the guardian may cancel, and the guardian cannot propose', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op2);
    expect(await outcome(c.registry.call.cancelPending(schnorr(c.op1)).send())).not.toBe('accepted');
    expect(await outcome(c.registry.call.cancelPending(schnorr(c.mallory)).send())).not.toBe('accepted');
    expect(Number((await c.registry.getState()).status)).toBe(1);
  });

  it('cancelling with nothing pending is refused', async () => {
    const c = await setup();
    expect(await outcome(c.registry.call.cancelPending(schnorr(c.guardian)).send())).not.toBe('accepted');
  });
});

describe('RootRegistry: push window', () => {
  it('opens for an active root only after 4032 idle blocks, and not while a proposal is pending', async () => {
    const c = await setup();
    await c.propose(c.op1, c.op2);
    await mine(ROOT_DELAY + 2);
    await c.activate();
    const open = (blocks: number) => c.lock(blocks, () => c.registry.call.openPush().send());
    expect(await outcome(open(PUSH_DELAY))).not.toBe('accepted');      // just activated
    await mine(PUSH_DELAY - 3);
    expect(await outcome(open(PUSH_DELAY))).not.toBe('accepted');      // 4029 blocks: not yet
    await mine(5);
    expect(await outcome(open(PUSH_DELAY))).toBe('accepted');          // 4034 blocks: open
    expect((await c.registry.getState()).pushEpoch).toBe(1n);
    expect(await outcome(open(PUSH_DELAY))).not.toBe('accepted');      // already open for epoch 1
  });
});
