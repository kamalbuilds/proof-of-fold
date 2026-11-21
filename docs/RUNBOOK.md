# Runbook

Every step prints a txid and appends it to `deployments/<net>/txs.jsonl`. Keys come from the gitignored `.env` (`scripts/gen-keys.ts`). The driver is `scripts/run.ts`.

```bash
npx tsx scripts/gen-keys.ts                         # once: deployer, 3 operators, guardian, pusher, desk, per network
npx tsx scripts/balance.ts <net>                    # addresses and balances

# epoch: pins the raw GetDistro response, builds leaves and the Merkle tree
npx tsx scripts/run.ts <net> epoch 1 11-01-2026 11-20-2026 <whole tokens> <demo leaves> <whole tokens per demo leaf>

npx tsx scripts/run.ts <net> deploy <rootDelay> <pushDelay> <token category>   # registry, then pool
npx tsx scripts/run.ts <net> fund <whole tokens>    # reward tokens into the pool's token container
npx tsx scripts/run.ts <net> propose 1              # 2-of-3 operators propose root + snapshot hash
npx tsx scripts/run.ts <net> activate               # after rootDelay blocks, permissionless
npx tsx scripts/run.ts <net> sync                   # pool copies the active root
npx tsx scripts/run.ts <net> burners <n> <sats>     # fee float for the demo claimers
npx tsx scripts/run.ts <net> claim-demo <i> <z-address>
npx tsx scripts/run.ts <net> open-push && npx tsx scripts/run.ts <net> sync && npx tsx scripts/run.ts <net> push <index>
npx tsx scripts/tx.ts <net> <txid>                  # read a transaction back from the network
npx tsx scripts/publish-web-data.ts                 # copy deployment data into web/public/data
```

Delay profiles: production is 144 blocks for the audit window and 4032 for the push window. The live deployments use a short profile (6 and 12 blocks on chipnet) so a full cycle completes inside a working day; both numbers are constructor arguments visible on chain.

Chipnet funding: `scripts/faucet.ts` solves the proof-of-work challenge of chipnet.bch.ninja and can also mint a test CashToken.
