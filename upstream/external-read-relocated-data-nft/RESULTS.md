# RESULTS: external-read-relocated-data-nft

Environment: node v24.22.2, npm 11.19.1, vitest 5.0.4, scratch monorepo built with `tsc -b` (route: the clone's own SDK source,
not the installed 0.50.0 package). Base eda85a88d752525ab1fe92f03e9dba04a45b518a.

## 1. RED: master, new test file, no fix

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 × test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads again with no owner transaction in between 841ms
   → expected 'messageBus: BCH-2026 preflight failed…' to be 'accepted' // Object.is equality
 × test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads from a second reader after the first moved the data NFTs 105ms
   → expected 'messageBus: BCH-2026 preflight failed…' to be 'accepted' // Object.is equality
 ✓ test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > keeps the owner usable after readers moved its data NFTs 81ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads again with no owner transaction in between
AssertionError: expected 'messageBus: BCH-2026 preflight failed…' to be 'accepted' // Object.is equality
Expected: "accepted"
Received: "messageBus: BCH-2026 preflight failed at input 0: Program failed an OP_VERIFY operation."
 ❯ test/e2e/ExternalReadRelocatedDataNft.test.ts:83:54
     81|
     82|     expect(await outcome(reader.call.sync().send())).toBe('accepted');
     83|     expect(await outcome(reader.call.sync().send())).toBe('accepted');
       |                                                      ^
     84|     expect(((await reader.getState()) as { count: bigint }).count).toB…
     85|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL  test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads from a second reader after the first moved the data NFTs
AssertionError: expected 'messageBus: BCH-2026 preflight failed…' to be 'accepted' // Object.is equality
Expected: "accepted"
Received: "messageBus: BCH-2026 preflight failed at input 0: Program failed an OP_VERIFY operation."
 ❯ test/e2e/ExternalReadRelocatedDataNft.test.ts:94:54
     92|
     93|     expect(await outcome(first.call.sync().send())).toBe('accepted');
```

## 2. RED: master plus upstream #4 (src fix line removed), verbose

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 × test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads again with no owner transaction in between 10058ms
   → expected 'messageBus: BCH-2026 preflight failed…' to be 'accepted' // Object.is equality
 × test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads from a second reader after the first moved the data NFTs 1563ms
   → expected 'messageBus: BCH-2026 preflight failed…' to be 'accepted' // Object.is equality
 ✓ test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > keeps the owner usable after readers moved its data NFTs 830ms
```

Failure line in both: `Received: "messageBus: BCH-2026 preflight failed at input 0: Program failed an OP_VERIFY operation."`

## 3. Cause, read from the mock chain (real registry and pool contracts, two pools on one registry, no registry tx between)

Data NFTs at the registry's data-NFT address after the first pool synced (txid prefix, vout, commitment prefix):

```
c9e0199f:2  commitment 5120..  (index 1, still in the registry's own tx)
c9e0199f:3  commitment 5220..  (index 2, still in the registry's own tx)
f7431273:2  commitment 0020..  (index 0, moved to pool 1's sync tx)
sync of pool 1: "accepted"
sync of pool 2: "messageBus: BCH-2026 preflight failed at input 0: Program failed an OP_VERIFY operation."
```

Sorted by vout, position 0 is c9e0199f:2 (index 1): the wrong NFT.

## 4. GREEN: with the fix, new test file (and #4's own test, to show it does not disturb it)

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 ✓ test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads again with no owner transaction in between 5422ms
 ✓ test/e2e/StatefulRelativeLock.test.ts > stateful this.age > puts the sequence on the master input only, and spends once the master is 3 blocks deep 6402ms
 ✓ test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > reads from a second reader after the first moved the data NFTs 1040ms
 ✓ test/e2e/ExternalReadRelocatedDataNft.test.ts > an external read of another contract whose data NFTs an earlier read moved > keeps the owner usable after readers moved its data NFTs 418ms
 ✓ test/e2e/StatefulRelativeLock.test.ts > stateful this.age > derives the later state, event and transfer of a function that checks this.age 484ms
 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  00:12:52
   Duration  74.22s (transform 50%, import 37%, tests 9%, setup 3%, worker 1%)
```

The same two-pool scenario with the real contracts after the fix: `["accepted","accepted"]`.

## 5. Regression: twelve existing test files that use external contracts, with the fix

```
 Test Files  12 passed (12)
      Tests  96 passed (96)
   Start at  00:14:23
   Duration  456.07s (tests 88%, import 8%, transform 3%, setup 1%)
```

Files: SortedMappingProofInputCoordinate, six journal-message-bus Kernel* e2e files, ExternalCallAutoDerive, DirectMultiCall,
DeployerCalleeRegions.

Blind spots: mock network, not chipnet; layouts with one data NFT cannot show the bug; the full solidcash suite was not run.
`tsc` on the package and `eslint` on the two files are clean.
