# Win conditions

Entry: FoldClaim for FoldingCash, pull-based reward claims written in SolidCash. Targets the FoldingCash bounty and the Best SolidCash Application prize.

## Rival to beat

FoldClaim by samizdatproject (entry 51312), the only other entry that is FoldingCash-specific, SolidCash and live on mainnet.
Demo: https://samizdatproject.github.io/foldclaim/ . Repo: github.com/samizdatproject/foldclaim (no LICENSE file, design read only, no code reused).

## What a judge gets in the first minute that the rival lacks

| Judge action | Rival | This entry |
| --- | --- | --- |
| Claim tokens into their own wallet | Only the 10 demo recipients, relayer capped at 3 requests per IP per hour | Paste any token-aware address, press Claim, the browser signs with a published demo key and broadcasts over a public Electrum socket. No relayer, no cap per IP. |
| See that the payout data is real | 300 synthetic leaves, 290 with no known key | Leaf set built from the live sponsor API (api.folding.cash GetDistro) response, raw JSON, URL and SHA-256 pinned in the registry proposal |
| Verify a root without a CLI | CLI `--verify` only | In-page watcher: re-fetch the pinned URL, rebuild the tree, compare to the pending root on chain, MATCH or MISMATCH, plus a tampered-snapshot button that turns red |
| See a double claim refused | Not shown | Button that submits the second claim and shows the node or VM rejection |
| Legacy 1... folders (the whole live population: 56 of 56 rows today carry only a legacy address) | Not parsed, "names without a valid address get nothing" | Method 1 leaves: the key behind the legacy address signs the claim and picks a token-aware destination. The signature is the link, no trust in a mapping database. |

## Contract-level edges over the rival

- Root authority: 2-of-3 operator keys propose (ECDSA OP_CHECKMULTISIG), a separate guardian key can cancel a pending root during the 144 block window and can never propose. Rival: one key, no veto.
- A pending proposal blocks a new one, so the operator cannot restart the audit window. Cancelled epochs are burned.
- Operator push (stretch S4): allowed only after the registry has held an active root idle for 4032 blocks and only for payouts of at least MIN_PUSH, always to the leaf's own identity. Rival: not built.
- Leaf format records a method byte, so the open question "leaf contents / link method" is answered on chain.
- Cumulative-only roots: a user pays out the difference, skips epochs freely.

## Live evidence

Chipnet deployment with the full lifecycle read back from the chain (README table, TESTS.md, deployments/chipnet/): registry and pool genesis, pool funded, epoch 1 proposed by two operators and activated after the audit window, epoch 2 cancelled by the guardian, epoch 3 and 4 activated, claims from the command line and from the browser, the second claim refused by the covenant (NothingToClaim) and by the node (transaction already in block chain), a claim that pays only the difference between epochs, operator push after the push window. The early activation attempt is refused by the node with non-BIP68-final until the window has passed.

## Windows

The production profile is 144 blocks for the audit window and 4032 for the push window. Both are constructor arguments of the registry; the live deployments use a shorter profile (6 and 12) so the whole cycle runs inside a day. The values are shown on the page and verifiable on chain.

## Host asset

FLDCH, category `0adb865ee9cc3038de87fba682e6cd361414edc9acff0da2fd0690d75341c640` (mainnet). Chipnet rehearsal runs the identical flow with a chipnet fungible token genesis. See FUNDING.md.

## File paths

- Contracts: `contracts/RootRegistry.scash`, `contracts/FoldClaimPool.scash`
- Merkle library and leaf format: `src/merkle.ts`, `src/identity.ts`
- Tests (solidhat): `test/registry.test.ts`, `test/pool.test.ts`, `test/merkle.test.ts`
- Mutation proofs: `TESTS.md`
- Upstream PR branches and patches: `upstream/`
