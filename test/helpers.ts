import { readFileSync } from 'node:fs';
import { ethers } from '@solidcash/solidhat/hardhat3';
import { mine } from '@nomicfoundation/hardhat-network-helpers';
import { SignatureTemplate, SighashType, SignatureAlgorithm } from '@solidcash/solidcash';
import { StatefulContract, getDataNftLockingBytecode } from '@solidcash/solidcash/stateful';
import { hexToBin, binToHex } from '@bitauth/libauth';
import { MerkleTree, leafKey, type Entry } from '../src/merkle.js';
import { hash160, p2pkhLock } from '../src/identity.js';
import { withRelativeLock } from '../src/relative-lock.js';

export const poolArtifact = JSON.parse(readFileSync(new URL('../artifacts/solidcash/FoldClaimPool.json', import.meta.url), 'utf8'));
export const ASSET = 'f01dca5ef01dca5ef01dca5ef01dca5ef01dca5ef01dca5ef01dca5ef01dca5e';
export const OTHER = 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
export const POOL_TOKENS = 1_000_000_000n;
export const ROOT_DELAY = 144;
export const PUSH_DELAY = 4032;
export const ecdsa = (s: { privateKey: Uint8Array }) => new SignatureTemplate(s.privateKey, SighashType.SIGHASH_ALL, SignatureAlgorithm.ECDSA);
export const sig = (s: { privateKey: Uint8Array }) => new SignatureTemplate(s.privateKey);
export const outcome = (p: Promise<unknown>) => p.then(() => 'accepted', (e: any) => String(e?.message ?? e));

/** Synthetic folder: a locking bytecode nobody holds a key for. */
export const syntheticLock = (seed: number) => {
  const pkh = new Uint8Array(20);
  new DataView(pkh.buffer).setUint32(0, seed);
  pkh[19] = 0xfc;
  return p2pkhLock(pkh);
};

export async function setup(opts: { fillers?: number } = {}) {
  const [op1, op2, op3, guardian, alice, bob, mallory, dest] = await ethers.getSigners(8);
  const provider: any = op1.provider;
  const regFactory = await ethers.getContractFactory('RootRegistry', op1);
  const registry: any = await regFactory.deploy(op1.publicKey, op2.publicKey, op3.publicKey, guardian.publicKey);
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
        constructorArgs: [op1.publicKey, op2.publicKey, op3.publicKey, guardian.publicKey],
      },
    },
  } as any);

  await pool.connect(op1).call.fund(hexToBin(ASSET)).tokenContainerDeposit(ASSET, POOL_TOKENS).addInput(tokenCoin, op1.unlockP2PKH()).send();

  // two BCH-address leaves and two legacy-key leaves, then fillers with no key
  const legacy = [0, 1].map((i) => {
    const privateKey = new Uint8Array(32).fill(0x40 + i);
    const t = new SignatureTemplate(privateKey);
    return { privateKey, publicKey: t.publicKey, pkh: hash160(t.publicKey) };
  });
  const entries: Entry[] = [
    { method: 0, identity: alice.getLockingBytecode(), cumulative: 5_000n },
    { method: 0, identity: bob.getLockingBytecode(), cumulative: 12_345n },
    { method: 1, identity: legacy[0].pkh, cumulative: 70_000n },
    { method: 1, identity: legacy[1].pkh, cumulative: 9_999n },
  ];
  for (let i = 0; i < (opts.fillers ?? 12); i++) entries.push({ method: 0, identity: syntheticLock(i), cumulative: BigInt(1000 + i) });
  return { op1, op2, op3, guardian, alice, bob, mallory, dest, provider, registry, pool, legacy, entries };
}
export type Ctx = Awaited<ReturnType<typeof setup>>;

export const activate = (c: Ctx) =>
  withRelativeLock(c.registry.categoryId, ROOT_DELAY, () => c.registry.call.activateRoot().send());

/** Activate once the audit window has passed; the mock confirms the proposal one block late, so allow a few extra blocks. */
export async function activateWhenReady(c: Ctx) {
  for (let extra = 0; ; extra++) {
    try { return await activate(c); } catch (e: any) {
      if (!/BIP68/.test(String(e?.message)) || extra >= 4) throw e;
      await mine(1);
    }
  }
}

/** Propose, wait out the audit window, activate, and sync the pool. */
export async function publish(c: Ctx, tree: MerkleTree, epoch: bigint, snapshot = new Uint8Array(32).fill(0x11)) {
  await c.registry.call.proposeRoot(ecdsa(c.op1), ecdsa(c.op2), tree.root, snapshot, epoch).send();
  await mine(ROOT_DELAY);
  await activateWhenReady(c);
  await c.pool.connect(c.op1).call.syncRoot().send();
}

export const tokensAt = async (c: Ctx, lockingBytecode: Uint8Array) => {
  const utxos = await c.provider.getUtxosForLockingBytecode(lockingBytecode);
  return utxos.filter((u: any) => u.token?.category === ASSET).reduce((n: bigint, u: any) => n + u.token.amount, 0n);
};

type Over = Partial<{ category: string; identity: Uint8Array; leafKey: Uint8Array; cumulative: bigint; proof: Uint8Array; index: bigint }>;
/** Method 0 claim for entries[index]; any argument may be forged through `o`. */
export const claim = (c: Ctx, by: any, tree: MerkleTree, index: number, o: Over = {}) => {
  const e = tree.entries[index];
  return c.pool.connect(by).call.claim(
    hexToBin(o.category ?? ASSET), o.identity ?? e.identity, o.leafKey ?? leafKey({ method: 0, identity: o.identity ?? e.identity }), o.cumulative ?? e.cumulative,
    o.proof ?? tree.proof(index).proofBytes, o.index ?? BigInt(index),
  ).send();
};

type KeyOver = Over & { signWith: Uint8Array; destination: Uint8Array; publicKey: Uint8Array };
/** Method 1 claim for entries[index], signed with `signWith` (the right key by default). */
export const claimKey = (c: Ctx, by: any, tree: MerkleTree, index: number, key: { privateKey: Uint8Array; publicKey: Uint8Array },
  destination: Uint8Array, o: Partial<KeyOver> = {}) => {
  const e = tree.entries[index];
  return c.pool.connect(by).call.claimWithKey(
    new SignatureTemplate(o.signWith ?? key.privateKey), o.publicKey ?? key.publicKey,
    hexToBin(o.category ?? ASSET), o.destination ?? destination, o.leafKey ?? leafKey(e), o.cumulative ?? e.cumulative,
    o.proof ?? tree.proof(index).proofBytes, o.index ?? BigInt(index),
  ).send();
};
export { MerkleTree, hexToBin, binToHex, mine, p2pkhLock };
