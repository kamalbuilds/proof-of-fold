# fix(solidcash): pick an external data NFT by its index tag, not by vout

## Summary

A stateful contract B that reads public state of another stateful contract A through an interface fails on the second read
with `Program failed an OP_VERIFY operation`, although A's state has not changed and the right data NFT exists. The cause
is in `StatefulContract._findExternalDataNft`: it orders A's data NFTs by vout and takes position `nftIndex`.

## Root cause

`packages/solidcash/src/stateful/StatefulContract.ts` on eda85a88d, `_findExternalDataNft`, lines 14472 to 14486
(called from `sc-load-create-builder-external-reads.ts:106`):

```ts
const utxos = await this.inner.provider.getUtxos(dataNftAddress);
const dataNfts = utxos.filter(...mutable NFT of the category with a commitment...)
  .sort((a, b) => a.vout - b.vout);          // line 14485
return dataNfts[nftIndex];                    // line 14486
```

A read co-spends only the data NFTs the reading function needs and re-creates them in B's own transaction. After one read the
data NFTs at A's data-NFT address are therefore spread over two or more transactions, and their vouts say nothing about their
index. Example from the repro (and the same shape as the registry in a chipnet run): index 0 is re-created at vout 2 of B's
transaction, index 1 stays at vout 1 or 2 of A's last transaction. Sorted by vout, position 0 is then index 1 (or a tie that
goes the wrong way), the read hands the covenant the wrong data NFT, and its commitment check fails.

The selection does not use A's last transaction; it picks from whatever sits at the data-NFT address, and that set is correct.
Only the order is wrong. For a layout with more than one data NFT, every commitment already starts with an index tag
(`00 20 ...`, `51 20 ...`, `52 20 ...`), and `StateReader.findDataNfts` already orders by that tag; A's own state reads use it.

## Fix

`_findExternalDataNft` looks up the registered external contract for the category and uses
`new StateReader(layout).findDataNfts(utxos, category)[nftIndex]` with that contract's `stateLayout`. An index-tagged layout is
ordered by the tag, an untagged singleton keeps vout order, and when no layout is registered the old path is unchanged.
One file, three edits (the import, a comment, four lines).

## Test

`packages/solidcash/test/e2e/ExternalReadRelocatedDataNft.test.ts`, MockNetworkProvider. A has five public fields spanning two
data NFTs; B reads `epoch` and increments its own counter.

- B reads twice in a row with no transaction of A between.
- A second instance of B reads after the first moved A's data NFTs.
- Control, passes before and after: A can still be read with `getState()` and can publish again after B's reads.

```bash
yarn install --ignore-scripts && yarn build
cd packages/solidcash && npx vitest run test/e2e/ExternalReadRelocatedDataNft.test.ts
```

## Evidence

RESULTS.md. Red on master (2 of 3, `Program failed an OP_VERIFY operation`) and on master plus #4. Green with the fix (3 of 3).
The real registry and pool contracts of a Merkle claim application show the same failure, a second pool syncing from one
registry, and pass with the fix. Twelve existing test files that use external contracts (96 tests) pass.

## Limits

- Mock network only. A chipnet run of the fix was not made; the chipnet observation is the report that led to this.
- The repro has two data NFTs, the registry in the report has three. The tie-or-lower-vout condition is what triggers it; other
  layouts that keep the relocated NFT at a lower vout than its neighbours do not fail, which is why single reads work.
- Only the data-NFT read path (`er.kind === 'data'`) is changed. The entry-NFT read branch picks by commitment already.
- Both the toy contracts in the test and the full-size ones use `address` constructor arguments built with
  `getDataNftLockingBytecode`.

<details><summary>ExternalReadRelocatedDataNft.test.ts</summary>

```ts
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
```

</details>
