# Tests

Run: `npx solidhat test` (SolidHat project, mock network with BCH production limits: 10,000 byte inputs, 100,000 byte transactions, 128 byte commitments, dust and relay rules). 51 of 51 tests pass.

| File | Tests | Covers |
|---|---|---|
| test/registry.test.ts | 13 | 2-of-3 proposals, Schnorr refusal, pending/epoch rules, audit window, events, guardian veto, push window |
| test/pool.test.ts | 17 | method 0 and method 1 claims, 10 forged-claim shapes, key theft, replay, cumulative epochs, pending root, foreign token, events, operator push gates, push byte re-splitting, deposit-only fund |
| test/merkle.test.ts | 7 | tree, proofs, tamper, duplicates, little endian amount encoding |
| test/snapshot.test.ts | 6 | GetDistro parsing, exact decimal amounts, legacy address to hash160, root reproducible from the stored response |
| test/depth.test.ts | 8 | real claims at proof depth 1 to 24 under production limits |

## Every guard fails when broken

Each row breaks one guard in the contract source, runs the named test (red expected), restores the source and runs the same test again (green expected). 19 of 19 mutations are killed. Reproduce: `npx tsx scripts/mutate.ts <id>`. Raw output: docs/MUTATIONS.json.

| Mutation | Guard | Test | Broken | Restored |
|---|---|---|---|---|
| reg-multisig | 2-of-3 operator signatures on proposeRoot | test/registry.test.ts -t "refuses one operator key" | red | green |
| reg-window | audit window before activation | test/registry.test.ts -t "activates only after/cannot shorten" | red | green |
| reg-guardian | guardian-only cancel | test/registry.test.ts -t "only the guardian may cancel" | red | green |
| reg-pending | no second proposal while one is pending | test/registry.test.ts -t "refuses a second proposal" | red | green |
| reg-epoch | epochs strictly increase, cancelled ones burn | test/registry.test.ts -t "epoch is burned" | red | green |
| reg-push-age | push window opens only after pushDelay idle blocks | test/registry.test.ts -t "cannot be opened early" | red | green |
| pool-proof | Merkle proof against the active root | test/pool.test.ts -t "refuses every forged claim" | red | green |
| pool-receipt-key | receipt key is the hash of the leaf identity | test/pool.test.ts -t "refuses every forged claim" | red | green |
| pool-already | a leaf pays only cumulative minus already paid | test/pool.test.ts -t "pays a leaf once" | red | green |
| pool-negative | non-negative leaf index | test/pool.test.ts -t "refuses every forged claim" | red | green |
| pool-keysig | legacy key signature on claimWithKey | test/pool.test.ts -t "refuses a stranger" | red | green |
| pool-pusher | operator signature on push | test/pool.test.ts -t "refuses small payouts and outsiders" | red | green |
| pool-push-window | push only inside the registry push window | test/pool.test.ts -t "is refused until the registry" | red | green |
| pool-push-min | push minimum | test/pool.test.ts -t "refuses small payouts and outsiders" | red | green |
| pool-sync | sync only when the registry has something new | test/pool.test.ts -t "never reads a pending root" | red | green |
| pool-token | reward category check on claim (a foreign token parked at the container lock cannot be pulled out) | test/pool.test.ts -t "foreign token parked" | red | green |
| pool-depth | proof depth bound | test/pool.test.ts -t "deeper than 24" | red | green |
| pool-method | push method byte is exactly 0x00 or 0x01 (no re-splitting of method and identity) | test/pool.test.ts -t "review finding H1" | red | green |
| pool-fund | fund must deposit | test/pool.test.ts -t "review finding L2" | red | green |

## Claim size against proof depth

Real claims accepted under production limits (test/depth.test.ts, docs/depth-analysis.json). Each tree level adds 32 bytes of proof.

| Depth | Leaves | Claim transaction bytes |
|---|---|---|
| 1 | 2 | 7,605 |
| 4 | 16 | 7,702 |
| 8 | 256 | 7,831 |
| 9 | 512 | 7,863 |
| 12 | 4,096 | 7,959 |
| 16 | 65,536 | 8,087 |
| 20 | 1,048,576 | 8,215 |
| 24 | 16,777,216 | 8,343 |

## chipnet transactions

Read back with `npx tsx scripts/tx.ts chipnet <txid>` (size, fee, fee rate, confirmations) and `npx tsx scripts/tx-facts.ts chipnet` (all of them, writes deployments/chipnet/tx-facts.json).

| Step | Txid | Bytes | Fee (sats) | Sat/byte | Block |
|---|---|---|---|---|---|
| mint-token | a9e502d13201ec08ba3b4fcd4d0eff8e9b2e166e313d0dcb97465a6cfc5cdd39 | 262 | 500 | 1.91 | 341323 |
| deploy-registry | 5ce909bb6c8c91bdcb4107a5cbfb64a4e47ab8c99845a4e192bcb1508d2004f1 | 898 | 1898 | 2.11 | 341325 |
| deploy-pool | c5e7e20389f5ac2a3a77d66090e167d8c1abc9c29b80822d20bc630eed234dca | 842 | 1842 | 2.19 | 341326 |
| fund-pool | de97ac8b55f4b2560c380d16053e0f20f49f2256548188dee14f4b1345054585 | 5959 | 12298 | 2.06 | 341326 |
| propose-root | d51db6e2b8788a73e7be747fab4354c14cd786f7f70e1e9ba687a94f1151ee27 | 4706 | 9792 | 2.08 | 341327 |
| activate-root | d1ae9eef08f4d2d32dfc73c6c3a5b70f1ad5116576ade59de4c29e33dfbeb209 | 4859 | 10098 | 2.08 | 341389 |
| sync-root | a295c737825a7cbaa54ac379ce930235f39f42410dbefe596a8e0dcc2ca28b6c | 6372 | 13600 | 2.13 | 341393 |
| fund-burners | 5bc1f67686dce30c5a9a53c8885bb812be2ff3f33d0efba462a03f0e88047252 | 744 | 1721 | 2.31 | 341396 |
| fund-burners | 2849b71a24bd927e4abc4e8fbe2c5670fc2bcd995b3019301004b47b59035843 | 219 | 520 | 2.37 | 341397 |
| claim-demo | d779eefee38b3dd74fd1aa629fe8eea24e77b193b589d77a2590d84181e52b2d | 7847 | 16074 | 2.05 | 341399 |
| send | 3cac33b9cded0369d77b0dc3c4e31f4ef675550978adb8f40620c712d5ab9d1b | 219 | 520 | 2.37 | 341414 |
| propose-root | 25939f03c701e1dfbcd0dab9c2af7cf07091f7fbeea595c614629797d2ad462f | 4706 | 9790 | 2.08 | 341416 |
| cancel-pending | 28e744293a1832840df9b9faff4354b123ef96e778a8b352352e0fe361a888fa | 4097 | 8574 | 2.09 | 341418 |
| propose-root | b738b6f492f9ba4efd598da880b11efeeaa966897c0006a7f7063e85ad11c4a4 | 4707 | 9794 | 2.08 | 341418 |
| split-float | 1f693eedfedb10bc6bdbf7f1734c3fd50bea246146b7ac95a91d5c9343dfa295 | 253 | 624 | 2.47 | 341418 |
| claim-browser | d6139ea3f2e93ab9fda6c959ad979ec4a8bc7f1823f796362ab6d618aa4f5c87 | 7847 | 16074 | 2.05 | 341417 |
| deploy-pool | 51602319eeb32387bbbf65b5c8ef7178590ebe9a939441171fd08a9ff66eb8dd | 842 | 1842 | 2.19 | 341471 |
| fund-pool | 04f4cbcbdee053014e871ef70ec468d05ed7e0692a6fdffc3c0791da8170dc86 | 5953 | 12286 | 2.06 | 341474 |
| activate-root | 5c4631caa3934ef936f36d6a6c9bd0594f73cb57b109003559181ef7738e1e71 | 4859 | 10098 | 2.08 | 341482 |
| sync-root | c69134a64ee6fab12087d2ade3c75a19540245dfda3d555c94f14cddd38fd681 | 6366 | 13600 | 2.14 | 341487 |
| claim-demo | c7c18baa215d9ca0bac83e70ffeb996be755c67102259a0a9a2cb6cab688a573 | 7841 | 16062 | 2.05 | 341495 |
| propose-root | 02c7700af0290defca363863a7c1543add159fe726bc19a70107fe1d407b3446 | 4707 | 9792 | 2.08 | 341497 |
| claim-browser | 9bd9a4c80149da766cd6090eeb7bfc90739f32479e9cbbc9ccf0303071ac160d | 7841 | 16062 | 2.05 | 341501 |
| activate-root | b4338097a252c35c0445805f2ed8a48b3ee51f76a0a6213275e5e5a5a32bda2e | 4859 | 10098 | 2.08 | 341556 |
| sync-root | b3be6e163be3feadf86edef44119ea2b5907164a74e50d43371831c792354e2c | 6366 | 13600 | 2.14 | 341557 |
| claim-demo-delta | af5e326aef8566332f7e01565e47e7ce65cca9dcc8f6d0332df8394584394c37 | 7455 | 15264 | 2.05 | 341559 |
| open-push | d0d38fa875dac24ce88663473a634963f9e36cce6b31cc756152f9ed35790160 | 4604 | 9588 | 2.08 | 341962 |
| sync-root | 80c518fc32200c12d75dacdd5bc517e2100120f9e6dedfe53f65a12182c17965 | 6366 | 13600 | 2.14 | 341964 |
| push | 9a137d4c144799568b830ece32527e25e539a898d805bc7f251a3df81f4f4ed0 | 7746 | 15872 | 2.05 | 341964 |

### Refusals and vetoes seen on chipnet

| When | Action | Answer |
|---|---|---|
| 2026-11-21T16:48:13Z .. 17:00:31Z | activateRoot before the audit window ended (5 attempts, proposal block 341328) | the transaction was rejected by network rules. non-BIP68-final (code 64) ; then: activateRoot accepted at about 17:01Z, txid d1ae9eef08f4d2d32dfc73c6c3a5b70f1ad5116576ade59de4c29e33dfbeb209 |
| 2026-11-21T17:23Z | second claim for demo claimer 149 after txid d779eefe (SDK local covenant evaluation) | require failed: NothingToClaim(...) |
| 2026-11-21T17:24Z | rebroadcast of confirmed claim txid d779eefee38b3dd74fd1aa629fe8eea24e77b193b589d77a2590d84181e52b2d | the transaction was rejected by network rules. transaction already in block chain |
| 2026-11-21T17:28Z | guardian cancelPending on epoch 2, txid 28e744293a1832840df9b9faff4354b123ef96e778a8b352352e0fe361a888fa | accepted; registry status Idle, highEpoch 2, activeEpoch stays 1 |
| 2026-11-21T22:15Z | openPush after the push window, then push of leaf 178 (demo claimer 120) by the operator key | accepted; 175 tFLDCH paid to the leaf P2PKH, txid 9a137d4c144799568b830ece32527e25e539a898d805bc7f251a3df81f4f4ed0 |
