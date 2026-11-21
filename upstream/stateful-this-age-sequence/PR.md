# test(solidcash): the VM still enforces this.age under setSequence

**Relation to #4.** #4 (`fix(solidcash): set a stateful call's master input nSequence for this.age`) already adds
`setSequence(n)` to a pending stateful call, with the master-only sequence, the probe plumbing and the refusal for split/merge and
composed calls. This is not a second implementation: `setSequence` is the name #4 chose and this patch uses it. It is a
follow-up that adds only tests, to land after #4 (or be folded into it by its author). Applying #4's diff to master
(`prereq/upstream-pr4.diff`, read-only copy of `gh pr diff 4`, head 5b52811fbd4ae6250fce5791348f359a6208831f) is the base this was built and run on.

## Summary

One new test file, `packages/solidcash/test/e2e/StatefulRelativeLockBounds.test.ts`, on `MockNetworkProvider`. The contract is
`require(this.age >= 3)` with a counter. `setSequence` only puts a number on the master input; the chain still enforces the lock
as written. Three tests pin that:

- a sequence below the required age (0, 1, 2) is refused by `OP_CHECKSEQUENCEVERIFY` with the master 10 blocks old, naming
  "Sequence number: N; required sequence number: 3", and the state does not change; then `setSequence(3)` is accepted;
- a time-based sequence (`(1 << 22) | 3`) against a block-count require is refused for the sequence type flag;
- a larger sequence (6) holds the spend as `non-BIP68-final` until the master is that old, and with
  `setSequence(1).setSequence(3)` the last call wins (the master is young again after the previous spend, so the node refuses
  `3`, where a surviving `1` would have failed in the script instead).

## Motivation

#4's tests show the default sequence fails and that the right sequence passes once mature. They do not show the other
direction, that `setSequence` cannot be used to get under the lock. A consumer who reads "set the sequence" can wonder whether
the SDK now decides the lock. These tests answer that and would catch a regression where the call option starts overriding
the value the script checks, or where the sequence is dropped on a rebuilt transaction.

## Test

```bash
# on master with #4 applied
git apply prereq/upstream-pr4.diff && git am 0001-*.patch
yarn install --ignore-scripts && yarn build
cd packages/solidcash && npx vitest run test/e2e/StatefulRelativeLock.test.ts test/e2e/StatefulRelativeLockBounds.test.ts
```

## Evidence

RESULTS.md. Red on master without #4 (`setSequence is not a function`, 3 of 3). Green on master plus #4 (5 of 5 with #4's own
two). With `setSequence` made a no-op (`this.sequenceOverride = sequence` removed) all three fail on the default sequence's message.
One more result, see the review comment: with `_pinMasterSequence` made a no-op, #4's own tests and these stay green.

## Limits

- It is tests only. It needs #4's source to pass and is red without it by design.
- The mock network enforces BIP68 in its mempool and the VM in preflight; a real node was not run.
- Only an ordinary stateful call is covered, the one #4 supports.
- The three tests run on mock chains whose heights start at the mock's default; the `mined >= 5` bound in the third test
  assumes the master is fresh at deploy, as the `deployMatured` helper (copied from #4's test file) sets up.

## Review / repro comment for #4 (ready to paste, not posted)

> Ran this branch (head 5b52811f) on master eda85a88d (0.51.0), packages built with `tsc -b`, vitest 5.0.4, node 24.
>
> **What passes.** `StatefulRelativeLock.test.ts`: 2 of 2. I also added three cases on top and they pass (file below):
> - `setSequence(0|1|2)` with `require(this.age >= 3)` and a master 10 blocks old: refused in preflight with
>   `Program called an OP_CHECKSEQUENCEVERIFY operation that requires a sequence number greater than the input's sequence number. Sequence number: 2; required sequence number: 3.`
>   State unchanged. `setSequence(3)` then accepted.
> - `setSequence((1 << 22) | 3)`: refused with `... incompatible sequence type flag ... Sequence number: 4194307; required sequence number: 3.`
> - `setSequence(6)`: `non-BIP68-final` until the master is 6 deep, then accepted; `.setSequence(1).setSequence(3)` applies the last value.
>
> A realistic contract also works. A registry with nine state fields, an enum, an event and a `this.age >= rootDelay` check in
> `activateRoot()` activates with `.setSequence(144)` after the window and is refused with the VM's CHECKSEQUENCEVERIFY error at `143`.
> That suite compiles it from `examples/merkle_pull_claim/RootRegistry.scash` (a separate PR, depends on this one).
>
> **One observation.** With `_pinMasterSequence()` turned into an early return, both tests in `StatefulRelativeLock.test.ts` still
> pass (2 of 2), and so do mine (3 of 3). By my read the rebuild through `applyOverrides` already carries the sequence on the paths
> these tests reach, so the pin guards something they do not reach (the unlocker refresh it mentions). If there is a path where it
> matters, a test that reaches it would keep it from being deleted by accident. If there is not, it could go. I did not find the
> path; this is a question, not a bug.
>
> The `sequenceOverride` removal in `StatefulFunctionCall.setSequence` fails all three of my tests on the default sequence message,
> so the new cases do guard the option itself.
>
> The cases are in a separate file so they do not touch yours: `packages/solidcash/test/e2e/StatefulRelativeLockBounds.test.ts`.
> Happy to push them as a follow-up PR once this merges, or you can take the file into this one.

<details><summary>StatefulRelativeLockBounds.test.ts</summary>

```ts
import { describe, expect, it } from 'vitest';
import { compileString } from '../direct-compile.js';
import { Contract, SignatureTemplate } from '../../src/index.js';
import { StatefulContract } from '../../src/stateful/index.js';
import MockNetworkProvider from '../../src/network/MockNetworkProvider.js';
import { alicePkh, alicePriv, alicePub } from '../fixture/vars.js';
import type { Utxo } from '../../src/interfaces.js';
import p2pkhArtifact from '../fixture/p2pkh.artifact.js';

// `setSequence` only puts a number on the master input. The chain still enforces `this.age` exactly as written, so a
// sequence below the required age, or of the other lock type, is refused by the VM, and a larger one holds the spend
// until the master is that old.
const SRC = `pragma solidcash >=0.8.0;
contract Matured() {
  int counter;
  function tick() {
    require(this.age >= 3);
    this.counter = this.counter + 1;
  }
}`;

const outcome = (send: Promise<unknown>): Promise<string> => send.then(
  () => 'accepted',
  (error: unknown) => String((error as Error)?.message ?? error),
);

async function deployMatured(): Promise<{ provider: MockNetworkProvider; contract: StatefulContract<any> }> {
  const provider = new MockNetworkProvider();
  const p2pkh = new Contract(p2pkhArtifact, [alicePkh], { provider });
  const fundingUtxo: Utxo = { txid: 'a7'.repeat(32), vout: 0, satoshis: 200_000n };
  await provider.addUtxo(p2pkh.address, fundingUtxo);
  const { contract } = await StatefulContract.deploy(compileString(SRC), [], {
    provider,
    fundingUtxo,
    funder: p2pkh.unlock.spend(alicePub, new SignatureTemplate(alicePriv)),
    initialState: { counter: 0n },
    changeAddress: p2pkh.address,
    initialBalance: 50_000n,
  });
  return { provider, contract };
}

const counter = async (contract: StatefulContract<any>): Promise<bigint | undefined> => (
  (await contract.getState()) as { counter?: bigint }
).counter;

describe('stateful this.age: the VM still enforces the lock', () => {
  it('refuses a sequence below the required age, however old the master is', async () => {
    const { provider, contract } = await deployMatured();
    await provider.mine(10);

    for (const sequence of [0, 1, 2]) {
      expect(await outcome(contract.call.tick().setSequence(sequence).send()))
        .toMatch(new RegExp(`OP_CHECKSEQUENCEVERIFY.*Sequence number: ${sequence}; required sequence number: 3`));
    }
    expect(await counter(contract)).toBe(0n);

    expect(await outcome(contract.call.tick().setSequence(3).send())).toBe('accepted');
    expect(await counter(contract)).toBe(1n);
  });

  it('refuses a time-based sequence against a block-count require', async () => {
    const { provider, contract } = await deployMatured();
    await provider.mine(10);

    const timeBased = (1 << 22) | 3;
    expect(await outcome(contract.call.tick().setSequence(timeBased).send())).toMatch(/incompatible sequence type flag/);
    expect(await counter(contract)).toBe(0n);
  });

  it('a larger sequence holds the spend until the master is that old, and the last setSequence wins', async () => {
    const { provider, contract } = await deployMatured();

    expect(await outcome(contract.call.tick().setSequence(6).send())).toMatch(/non-BIP68-final/);
    let mined = 0;
    while (await outcome(contract.call.tick().setSequence(6).send()) !== 'accepted') {
      await provider.mine(1);
      mined++;
      expect(mined).toBeLessThan(10);
    }
    expect(mined).toBeGreaterThanOrEqual(5);
    expect(await counter(contract)).toBe(1n);

    // The master was just respent, so it is young again; the first value would pass later, the last one is what applies.
    expect(await outcome(contract.call.tick().setSequence(1).setSequence(3).send())).toMatch(/non-BIP68-final/);
    expect(await counter(contract)).toBe(1n);
  });
});
```

</details>
