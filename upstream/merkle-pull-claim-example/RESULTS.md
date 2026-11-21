# RESULTS: merkle-pull-claim-example

Environment: node v24.22.2, npm 11.19.1, vitest 5.0.4, scratch monorepo built with `tsc -b` (packages' dist rebuilt after each
checkout). Base eda85a88d752525ab1fe92f03e9dba04a45b518a. Verification route: the clone's own solidc and SDK (not the installed 0.50.0 copies), contracts at
`pragma solidcash ^0.51.0`.

## 0. Compile with the clone's solidc

```
RootRegistry RootRegistry ... abi: proposeRoot|cancelPending|activateRoot|openPush
FoldClaimPool FoldClaimPool ... abi: fund|syncRoot|claim|claimWithKey|push
```

## 1. RED: example missing (master, test file only)

```
 RUN  v5.0.4 /private/tmp/scbuild/examples/testing-suite/test
 ❯ merkle_pull_claim.test.ts (0 test)
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  merkle_pull_claim.test.ts [ merkle_pull_claim.test.ts ]
Error: Cannot find module '../../merkle_pull_claim/merkle.js' imported from /private/tmp/scbuild/examples/testing-suite/test/merkle_pull_claim.test.ts
 ❯ merkle_pull_claim.test.ts:8:1
      6| import { ethers } from '@solidcash/testing';
      7| import { mine } from '@nomicfoundation/hardhat-network-helpers';
      8| import { MerkleTree, leafKey, type Entry } from '../../merkle_pull_cla…
       | ^
      9|
     10| // A registry publishes a Merkle root only after a public audit window…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  no tests
   Start at  18:30:38
   Duration  5.92s (setup 66%, transform 33%)
```

## 2. RED: example present, #4 missing (master dist rebuilt, no setSequence)

```
 RUN  v5.0.4 /private/tmp/scbuild/examples/testing-suite/test
 ❯ merkle_pull_claim.test.ts (6 tests | 6 failed) 4238ms
   ❯ RootRegistry: the audit window is enforced by the chain (2)
     × activates only once the registry UTXO is ROOT_DELAY blocks old, and no shorter sequence passes 1048ms
     × lets the guardian cancel a pending root, which the pool then never sees 463ms
   ❯ FoldClaimPool: pull claims against the active root (4)
     × pays a method 0 leaf once, to its own address, whoever submits it 1056ms
     × refuses every forged claim and pays nobody 664ms
     × pays only the difference under a newer cumulative root, and a folder may skip an epoch 450ms
     × pays a method 1 leaf to the destination its key signs for, and refuses another key 555ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  merkle_pull_claim.test.ts > RootRegistry: the audit window is enforced by the chain > activates only once the registry UTXO is ROOT_DELAY blocks old, and no shorter sequence passes
TypeError: c.registry.call.activateRoot(...).setSequence is not a function
 ❯ activate merkle_pull_claim.test.ts:74:82
     72| const propose = (c: Ctx, tree: MerkleTree, epoch: bigint) =>
     73|   c.registry.call.proposeRoot(ecdsa(c.op1), ecdsa(c.op2), tree.root, S…
     74| const activate = (c: Ctx, blocks = ROOT_DELAY) => c.registry.call.acti…
       |                                                                                  ^
     75|
     76| /** Propose, wait out the audit window, activate, and sync the pool. */
 ❯ Object.<anonymous> merkle_pull_claim.test.ts:114:26
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/6]⎯
```

## 3. GREEN: master plus #4

```
 RUN  v5.0.4 /private/tmp/scbuild/examples/testing-suite/test
 ✓ merkle_pull_claim.test.ts > RootRegistry: the audit window is enforced by the chain > activates only once the registry UTXO is ROOT_DELAY blocks old, and no shorter sequence passes 1526ms
 ✓ merkle_pull_claim.test.ts > RootRegistry: the audit window is enforced by the chain > lets the guardian cancel a pending root, which the pool then never sees 1042ms
 ✓ merkle_pull_claim.test.ts > FoldClaimPool: pull claims against the active root > pays a method 0 leaf once, to its own address, whoever submits it 794ms
 ✓ merkle_pull_claim.test.ts > FoldClaimPool: pull claims against the active root > refuses every forged claim and pays nobody 792ms
 ✓ merkle_pull_claim.test.ts > FoldClaimPool: pull claims against the active root > pays only the difference under a newer cumulative root, and a folder may skip an epoch 1454ms
 ✓ merkle_pull_claim.test.ts > FoldClaimPool: pull claims against the active root > pays a method 1 leaf to the destination its key signs for, and refuses another key 829ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  19:08:36
   Duration  21.94s (setup 35%, tests 30%, transform 26%, import 8%)
```

## 4. Mutations on the branch (each guard removed, suite run, then restored)

### M1 merkle proof not checked
```
× refuses every forged claim and pays nobody 1263ms
     × pays only the difference under a newer cumulative root, and a folder may skip an epoch 1087ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: Bob's proof, paid to Mallory: expected 'accepted' not to be 'accepted' // Object.is equality
AssertionError: expected 'accepted' not to be 'accepted' // Object.is equality
      Tests  2 failed | 4 passed (6)
```

### M2 receipt not checked
```
Tests  6 passed (6)
```

### M3 audit window not enforced
```
× activates only once the registry UTXO is ROOT_DELAY blocks old, and no shorter sequence passes 1389ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 'accepted' to match /OP_CHECKSEQUENCEVERIFY/
      Tests  1 failed | 5 passed (6)
```

### M2b receipt not recorded
```
× pays a method 0 leaf once, to its own address, whoever submits it 2370ms
     × pays only the difference under a newer cumulative root, and a folder may skip an epoch 2606ms
     × pays a method 1 leaf to the destination its key signs for, and refuses another key 1148ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 'accepted' not to be 'accepted' // Object.is equality
AssertionError: expected 13000n to be 8000n // Object.is equality
AssertionError: expected 'accepted' not to be 'accepted' // Object.is equality
      Tests  3 failed | 3 passed (6)
```

### M4 receipt key not bound to the leaf
```
× refuses every forged claim and pays nobody 1329ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: someone else's receipt key: expected 'accepted' not to be 'accepted' // Object.is equality
      Tests  1 failed | 5 passed (6)
```

M2 (`require(cumulative > already, ...)` removed) survives. The likely reason is that a second claim then asks for a zero-token
transfer, which fails anyway; that was not investigated, so treat the require as untested by this suite. M2b (the receipt write
removed) is the effective receipt mutation and is caught.

Blind spots: `push` and `openPush` are not exercised; the mock network is not a node (the BIP68 refusal there is the SDK's
mock mempool, as in #4's own tests); only one tree shape (8 leaves) is built.
