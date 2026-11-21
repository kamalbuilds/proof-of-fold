# feat(examples): merkle_pull_claim, a Merkle root registry and a pull-claim pool

Depends on #4 (`setSequence` on a stateful call): the registry's audit window is `require(this.age >= rootDelay)`, and
activating a root has to set the registry input's sequence. Please merge after #4, or after the equivalent.

## Summary

Adds `examples/merkle_pull_claim/` with two contracts, a small Merkle helper and a README, a vitest suite in
`examples/testing-suite/test/`, and a `website/docs/showcase.md` entry.

- `RootRegistry.scash`: two of three operator keys propose a root, a public audit window of `rootDelay` blocks (a relative
  timelock on the registry's own UTXO) must pass, then anyone activates it. A guardian key can cancel a pending root.
  `pushDelay` opens a later push window.
- `FoldClaimPool.scash`: holds reward tokens, copies the registry's active root through an `IRootRegistry` interface
  (`syncRoot`), verifies a Merkle proof in script, and pays each leaf `cumulative - already claimed` once. Method 0 leaves
  are keyed to a locking bytecode and anyone may submit; method 1 leaves are keyed to a hash160 and the key holder signs and
  names the destination. The `claimed` mapping is the receipt.
- `merkle.ts`: the off-chain tree and proof builder that agrees with the contract byte for byte.

## Motivation

The examples folder has no multi-contract application. This one shows patterns that SolidCash makes short and that are
easy to get wrong elsewhere: a contract reading another contract's state through an interface (`IRootRegistry`), a mapping
used as a receipt, in-script Merkle verification, a chain-enforced delay with `this.age`, and a signature that authorises
one payout to a destination of the signer's choice.

The pragma is `^0.51.0`. Both contracts compile with this repository's `solidc`.

## Test

`examples/testing-suite/test/merkle_pull_claim.test.ts`, six tests on the mock network:

- the audit window: activation is refused while the registry UTXO is young, a sequence one block short of `rootDelay` is
  refused by `OP_CHECKSEQUENCEVERIFY`, the exact one is accepted once the window has passed;
- a guardian cancel: a cancelled root cannot be activated and the pool never syncs it;
- a stranger relays a method 0 claim: the leaf's own address is paid, the relayer is not, a second claim pays nothing;
- eight forged claims (another leaf's proof, an inflated amount, a wrong index, a truncated proof, a proof whose length is
  not a multiple of 32, another token category, someone else's receipt key, a method 1 leaf claimed as method 0) pay nobody
  and leave the pool balance unchanged;
- a newer cumulative root pays only the difference and a recipient may skip an epoch;
- a method 1 claim pays the destination the key signed for, another key is refused, and it pays once.

```bash
yarn install --ignore-scripts && yarn build   # build the packages the testing suite imports
yarn workspace testing-suite test merkle_pull_claim
```

## Evidence

See RESULTS.md. The test is red with the example missing, red on this repository's master without #4 (`setSequence is not a
function`), green on master plus #4, and red when each of four guards in the contracts is removed in turn (the Merkle proof check,
the receipt write, the receipt key binding, the audit window). Removing the `cumulative > already` require alone is not
caught by this suite.

## Limits

- The suite runs on the mock network. The contracts are not audited. The pool's operator-push path (`push`, `openPush`)
  is part of the example but the suite does not exercise it; the registry's `pushDelay` is a constructor argument like
  `rootDelay`, so a deployment fixes both in its address.
- The suite compiles the contracts at test time from `../../merkle_pull_claim/*.scash` rather than committing artifacts, so
  the example folder holds the only copy of the sources.
- `website/docs/showcase.md` is marked `draft: true` and lists CashScript projects; the entry is added at the end and
  points at the example folder. Move it if a different home is preferred.
- Verified in a scratch copy of the monorepo installed with npm (yarn and the `file:../mem-cash` resolutions were not
  available), packages built with `tsc -b`. The suite imports the built `dist` of the SDK, so rebuild after pulling #4.
