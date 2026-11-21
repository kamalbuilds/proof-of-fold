import { describe, expect, it } from 'vitest';
import { hexToBin } from '@bitauth/libauth';
import { compileString } from '../direct-compile.js';
import { Contract, SignatureTemplate } from '../../src/index.js';
import { StatefulContract, getDataNftLockingBytecode } from '../../src/stateful/index.js';
import MockNetworkProvider from '../../src/network/MockNetworkProvider.js';
import { alicePkh, alicePriv, alicePub } from '../fixture/vars.js';
import type { Utxo } from '../../src/interfaces.js';
import p2pkhArtifact from '../fixture/p2pkh.artifact.js';

// B reads A's public state through an interface. The read co-spends A's data NFTs and re-creates them in B's
// transaction, so after one read they sit in B's transaction output, not in A's last own transaction.
const OWNER = `pragma solidcash >=0.8.0;
contract Owner() {
  int public epoch;
  bytes32 public root;
  bytes32 public s1;
  bytes32 public s2;
  bytes32 public s3;
  function publish(bytes32 x) {
    this.root = x;
    this.s1 = x;
    this.s2 = x;
    this.s3 = x;
    this.epoch = this.epoch + 1;
  }
}`;

const READER = `pragma solidcash >=0.8.0;
interface IOwner {
  public int epoch;
  public bytes32 root;
  public bytes32 s1;
  public bytes32 s2;
  public bytes32 s3;
}
contract Reader(address owner) {
  int count;
  function sync() {
    require(IOwner(owner).epoch == 1, "owner epoch");
    this.count = this.count + 1;
  }
}`;

const outcome = (send: Promise<unknown>): Promise<string> => send.then(
  () => 'accepted',
  (error: unknown) => String((error as Error)?.message ?? error),
);

async function setup() {
  const provider = new MockNetworkProvider();
  const p2pkh = new Contract(p2pkhArtifact, [alicePkh], { provider });
  const funder = p2pkh.unlock.spend(alicePub, new SignatureTemplate(alicePriv));
  let n = 0;
  const deploy = async (artifact: any, args: any[], initialState: Record<string, any>) => {
    const fundingUtxo: Utxo = { txid: (0xa0 + n++).toString(16).repeat(32), vout: 0, satoshis: 200_000n };
    await provider.addUtxo(p2pkh.address, fundingUtxo);
    const { contract } = await StatefulContract.deploy(artifact, args, {
      provider, fundingUtxo, funder, initialState, changeAddress: p2pkh.address, initialBalance: 50_000n,
    } as any);
    return contract as any;
  };
  const ownerArtifact = compileString(OWNER);
  const readerArtifact = compileString(READER);
  const owner = await deploy(ownerArtifact, [], { epoch: 0n, root: new Uint8Array(32), s1: new Uint8Array(32), s2: new Uint8Array(32), s3: new Uint8Array(32) });
  const ownerData = getDataNftLockingBytecode(owner.categoryId, hexToBin(owner.inner.lockingBytecode));
  const newReader = async () => {
    const deployed = await deploy(readerArtifact, [ownerData], { count: 0n });
    return StatefulContract.withCategory(deployed.inner, deployed.categoryId, {
      externalContracts: { IOwner: { artifact: owner.inner.artifact, categoryId: owner.categoryId, constructorArgs: [] } },
    } as any) as any;
  };
  return { provider, owner, newReader };
}

describe('an external read of another contract whose data NFTs an earlier read moved', () => {
  it('reads again with no owner transaction in between', async () => {
    const { owner, newReader } = await setup();
    await owner.call.publish(new Uint8Array(32).fill(7)).send();
    const reader = await newReader();

    expect(await outcome(reader.call.sync().send())).toBe('accepted');
    expect(await outcome(reader.call.sync().send())).toBe('accepted');
    expect(((await reader.getState()) as { count: bigint }).count).toBe(2n);
  });

  it('reads from a second reader after the first moved the data NFTs', async () => {
    const { owner, newReader } = await setup();
    await owner.call.publish(new Uint8Array(32).fill(7)).send();
    const first = await newReader();
    const second = await newReader();

    expect(await outcome(first.call.sync().send())).toBe('accepted');
    expect(await outcome(second.call.sync().send())).toBe('accepted');
    expect(((await second.getState()) as { count: bigint }).count).toBe(1n);
  });

  it('keeps the owner usable after readers moved its data NFTs', async () => {
    const { owner, newReader } = await setup();
    await owner.call.publish(new Uint8Array(32).fill(7)).send();
    const reader = await newReader();
    expect(await outcome(reader.call.sync().send())).toBe('accepted');

    expect(((await owner.getState()) as { epoch: bigint }).epoch).toBe(1n);
    await owner.call.publish(new Uint8Array(32).fill(9)).send();
    expect(((await owner.getState()) as { epoch: bigint }).epoch).toBe(2n);
  });
});
