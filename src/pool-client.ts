// Browser-safe client for RootRegistry and FoldClaimPool: attach to a deployment, build claims. No node: imports.
import { SignatureTemplate, Signer, SighashType, SignatureAlgorithm, type NetworkProvider } from '@solidcash/solidcash';
import { StatefulContract, getDataNftLockingBytecode } from '@solidcash/solidcash/stateful';
import registryArtifact from './artifacts/RootRegistry.json' with { type: 'json' };
import poolArtifact from './artifacts/FoldClaimPool.json' with { type: 'json' };
import { hexToBytes, bytesToHex, leafKey, type Entry } from './merkle.ts';
import { p2pkhLock } from './identity.ts';

export type Deployment = {
  network: 'chipnet' | 'mainnet';
  tokenCategory: string;                 // display order hex
  rootDelay: number;
  pushDelay: number;
  operators: string[];                   // 3 compressed pubkeys, hex
  guardian: string;
  pusher: string;
  registry: { categoryId: string; address: string; deployTxid: string };
  pool: { categoryId: string; address: string; deployTxid: string; fundTxid?: string };
  /** demo claimers (indices of demoKey) whose address holds a fee float on this network */
  fundedBurners?: { sats: string; indices: number[] };
};
export type EpochFile = {
  epoch: number; root: string; depth: number; snapshotSha256: string; url: string; params: unknown;
  entries: { index: number; method: 0 | 1; identity: string; cumulative: string; proof: string }[];
};

export const artifacts = { registryArtifact: registryArtifact as any, poolArtifact: poolArtifact as any };

export function registryArgs(d: Deployment): any[] {
  return [...d.operators.map(hexToBytes), hexToBytes(d.guardian), BigInt(d.rootDelay), BigInt(d.pushDelay)];
}

export function attach(d: Deployment, provider: NetworkProvider) {
  const registry: any = StatefulContract.from(registryArtifact as any, registryArgs(d), { provider } as any, d.registry.categoryId);
  const registryData = getDataNftLockingBytecode(d.registry.categoryId, hexToBytes(registry.inner.lockingBytecode));
  const pool: any = StatefulContract.from(poolArtifact as any, [hexToBytes(d.tokenCategory), registryData, hexToBytes(d.pusher)], {
    provider,
    externalContracts: { IRootRegistry: { artifact: registryArtifact as any, categoryId: d.registry.categoryId, constructorArgs: registryArgs(d) } },
  } as any, d.pool.categoryId);
  return { registry, pool };
}

export const ecdsaSig = (privateKey: Uint8Array) => new SignatureTemplate(privateKey, SighashType.SIGHASH_ALL, SignatureAlgorithm.ECDSA);

export type Leaf = { index: number; entry: Entry; proof: Uint8Array };
export function findLeaf(file: EpochFile, method: 0 | 1, identity: Uint8Array): Leaf | undefined {
  const k = bytesToHex(leafKey({ method, identity }));
  const e = file.entries.find((x) => bytesToHex(leafKey({ method: x.method, identity: hexToBytes(x.identity) })) === k);
  return e && { index: e.index, entry: { method: e.method, identity: hexToBytes(e.identity), cumulative: BigInt(e.cumulative) }, proof: hexToBytes(e.proof) };
}

/** Method 1 claim: the legacy key signs, `destination` is the locking bytecode that receives the tokens. */
export function claimWithKeyCall(d: Deployment, pool: any, provider: NetworkProvider, privateKey: Uint8Array, leaf: Leaf, destination: Uint8Array) {
  const signer = new Signer(privateKey, provider);
  const sig = new SignatureTemplate(privateKey);
  return pool.connect(signer).call.claimWithKey(
    sig, sig.publicKey, hexToBytes(d.tokenCategory), destination, leafKey(leaf.entry), leaf.entry.cumulative, leaf.proof, BigInt(leaf.index),
  );
}
/** Method 0 claim: any funder, tokens go to the leaf's own locking bytecode. */
export function claimCall(d: Deployment, pool: any, funder: Signer, leaf: Leaf) {
  return pool.connect(funder).call.claim(
    hexToBytes(d.tokenCategory), leaf.entry.identity, leafKey(leaf.entry), leaf.entry.cumulative, leaf.proof, BigInt(leaf.index),
  );
}
/** Operator push; a method 1 leaf pays P2PKH(hash160), which the contract builds itself, so the SDK is told the output. */
export function pushCall(d: Deployment, pool: any, funder: Signer, pusherKey: Uint8Array, leaf: Leaf) {
  const call = pool.connect(funder).call.push(
    new SignatureTemplate(pusherKey), hexToBytes(d.tokenCategory), Uint8Array.of(leaf.entry.method), leaf.entry.identity,
    leafKey(leaf.entry), leaf.entry.cumulative, leaf.proof, BigInt(leaf.index),
  );
  if (leaf.entry.method === 1) call.tokenContainerTransfer(d.tokenCategory, p2pkhLock(leaf.entry.identity), leaf.entry.cumulative);
  return call;
}
