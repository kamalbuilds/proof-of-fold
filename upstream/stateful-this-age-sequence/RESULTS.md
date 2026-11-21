# RESULTS: stateful-this-age-sequence

Environment: node v24.22.2, npm 11.19.1, vitest 5.0.4, scratch monorepo built with `tsc -b`. Base eda85a88d752525ab1fe92f03e9dba04a45b518a. Verification
route: the clone's own SDK source (the test imports `../../src`), not the installed 0.50.0 package. #4 applied as
one commit (6a21551d8) from `gh pr diff 4`, head 5b52811fbd4ae6250fce5791348f359a6208831f.

## 1. RED: master, no #4 (`setSequence` does not exist)

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 ❯ test/e2e/StatefulRelativeLockBounds.test.ts (3 tests | 3 failed) 276ms
   ❯ stateful this.age: the VM still enforces the lock (3)
     × refuses a sequence below the required age, however old the master is 235ms
     × refuses a time-based sequence against a block-count require 23ms
     × a larger sequence holds the spend until the master is that old, and the last setSequence wins 17ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > refuses a sequence below the required age, however old the master is
TypeError: contract.call.tick(...).setSequence is not a function
 ❯ test/e2e/StatefulRelativeLockBounds.test.ts:53:49
     51|
     52|     for (const sequence of [0, 1, 2]) {
     53|       expect(await outcome(contract.call.tick().setSequence(sequence).…
       |                                                 ^
     54|         .toMatch(new RegExp(`OP_CHECKSEQUENCEVERIFY.*Sequence number: …
     55|     }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
 FAIL  test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > refuses a time-based sequence against a block-count require
TypeError: contract.call.tick(...).setSequence is not a function
 ❯ test/e2e/StatefulRelativeLockBounds.test.ts:67:47
     65|
     66|     const timeBased = (1 << 22) | 3;
     67|     expect(await outcome(contract.call.tick().setSequence(timeBased).s…
       |                                               ^
```

## 2. GREEN: master plus #4, with #4's own test file and the new one

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 ✓ test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > refuses a sequence below the required age, however old the master is 5030ms
 ✓ test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > refuses a time-based sequence against a block-count require 807ms
 ✓ test/e2e/StatefulRelativeLock.test.ts > stateful this.age > puts the sequence on the master input only, and spends once the master is 3 blocks deep 7412ms
 ✓ test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > a larger sequence holds the spend until the master is that old, and the last setSequence wins 2183ms
 ✓ test/e2e/StatefulRelativeLock.test.ts > stateful this.age > derives the later state, event and transfer of a function that checks this.age 1057ms
 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  19:07:50
   Duration  35.52s (transform 41%, import 34%, tests 24%, setup 1%)
```

## 3. Mutation: `this.sequenceOverride = sequence;` removed from `StatefulFunctionCall.setSequence` (red)

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 ❯ test/e2e/StatefulRelativeLockBounds.test.ts (3 tests | 3 failed) 414ms
   ❯ stateful this.age: the VM still enforces the lock (3)
     × refuses a sequence below the required age, however old the master is 367ms
     × refuses a time-based sequence against a block-count require 26ms
     × a larger sequence holds the spend until the master is that old, and the last setSequence wins 21ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > refuses a sequence below the required age, however old the master is
AssertionError: expected 'messageBus: BCH-2026 preflight failed…' to match /OP_CHECKSEQUENCEVERIFY.*Sequence numb…/
- Expected:
/OP_CHECKSEQUENCEVERIFY.*Sequence number: 0; required sequence number: 3/
+ Received:
"messageBus: BCH-2026 preflight failed at input 0: Program called an OP_CHECKSEQUENCEVERIFY operation requiring the disable flag, but the input's sequence number is missing the disable flag. Sequence number: 4294967294."
 ❯ test/e2e/StatefulRelativeLockBounds.test.ts:54:10
     52|     for (const sequence of [0, 1, 2]) {
     53|       expect(await outcome(contract.call.tick().setSequence(sequence).…
     54|         .toMatch(new RegExp(`OP_CHECKSEQUENCEVERIFY.*Sequence number: …
       |          ^
     55|     }
     56|     expect(await counter(contract)).toBe(0n);
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯
 FAIL  test/e2e/StatefulRelativeLockBounds.test.ts > stateful this.age: the VM still enforces the lock > refuses a time-based sequence against a block-count require
AssertionError: expected 'messageBus: BCH-2026 preflight failed…' to match /incompatible sequence type flag/
- Expected:
/incompatible sequence type flag/
+ Received:
```

## 4. Observation: `_pinMasterSequence()` made a no-op (early return) stays green

New tests:

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  18:23:51
   Duration  3.00s (import 47%, transform 34%, tests 15%, setup 3%)
```

#4's own test file under the same mutation:

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  18:57:31
   Duration  13.41s (transform 43%, import 33%, tests 22%, setup 2%)
```

## 5. Same mutation reverted, new tests (green)

```
 RUN  v5.0.4 /private/tmp/scbuild/packages/solidcash
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  18:23:57
   Duration  2.12s (import 53%, transform 26%, tests 17%, setup 4%)
```

Blind spots: mock network only; a real node's relay policy was not run. The mutation in 4 shows a gap in #4's coverage, not a bug.
