// Generates README.md from the deployment records and the contract sources, so every txid and line reference is read, not typed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const read = (f: string) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const J = (f: string) => JSON.parse(read(f));
const net = process.argv[2] ?? 'chipnet';
const dir = `deployments/${net}`;
const dep = J(`${dir}/deployment.json`);
const epoch = J(`${dir}/epoch-1.json`);
const txs: any[] = read(`${dir}/txs.jsonl`).trim().split('\n').map((l) => JSON.parse(l));
const find = (what: string) => txs.filter((t) => t.what === what);
const first = (what: string) => find(what)[0]?.txid;
const at = (what: string, i: number) => find(what)[i]?.txid;
const explorer = net === 'mainnet' ? 'https://blockchair.com/bitcoin-cash/transaction/' : 'https://chipnet.imaginary.cash/tx/';
const link = (txid?: string) => (txid ? `[\`${txid}\`](${explorer}${txid})` : 'pending');
const reg = read('contracts/RootRegistry.scash').split('\n');
const pool = read('contracts/FoldClaimPool.scash').split('\n');
const ln = (src: string[], re: RegExp) => { const i = src.findIndex((l) => re.test(l)); if (i < 0) throw new Error('anchor missing: ' + re); return i + 1; };
const R = (re: RegExp) => `contracts/RootRegistry.scash:${ln(reg, re)}`;
const P = (re: RegExp) => `contracts/FoldClaimPool.scash:${ln(pool, re)}`;
const depth = J('docs/depth-analysis.json');
const d8 = depth.find((x: any) => x.depth === 8).claimTxBytes;
const counts = J('docs/test-counts.json');
const mut = J('docs/MUTATIONS.json');
const sym = net === 'mainnet' ? 'FLDCH' : 'tFLDCH';
const facts = existsSync(new URL('../' + dir + '/tx-facts.json', import.meta.url)) ? J(dir + '/tx-facts.json').facts : [];
const fact = (txid?: string) => facts.find((f: any) => f.txid === txid);
const claimFact = fact(at('claim-demo', 0));
const proposeFact = fact(at('propose-root', 0));
const activateFact = fact(at('activate-root', 0));
const syncFact = fact(at('sync-root', 0));

const out = `# FoldClaim

Pull-based FoldingCash rewards, written in SolidCash. A folder claims their own ${sym} with a Merkle proof and the key behind their existing address. The operator publishes one root per epoch instead of one payment per folder.

FoldClaim builds its payout leaves from the live sponsor API (\`api.folding.cash/v1/GetDistro\`), pins the SHA-256 of the raw response next to the root on chain, and lets anyone re-fetch the URL, rebuild the tree and compare. The 56 rows of the pinned window are all legacy \`1...\` addresses; FoldClaim pays them without any address-linking database, because the folder's key signs the claim.

## Live on ${net}

| What | Value |
|---|---|
| Token | \`${dep.tokenCategory}\` (${sym}, 8 decimals) |
| RootRegistry | \`${dep.registry.address}\` , category \`${dep.registry.categoryId}\` |
| FoldClaimPool | \`${dep.pool.address}\` , category \`${dep.pool.categoryId}\` |
| Windows | audit ${dep.rootDelay} and push ${dep.pushDelay} (constructor arguments; the contract measures them with the chain's relative timelock) |
| Epoch 1 root | \`${epoch.root}\` over ${epoch.entries.length} leaves, depth ${epoch.depth} |
| Snapshot | \`${epoch.url}\`, SHA-256 \`${epoch.snapshotSha256}\` |

| Step | Transaction |
|---|---|
| Registry genesis | ${link(at('deploy-registry', 0))} |
| Pool genesis | ${link(at('deploy-pool', 0))} |
| Pool funded | ${link(at('fund-pool', 0))} |
| Epoch 1 proposed by two operators | ${link(at('propose-root', 0))} |
| Epoch 1 activated after the audit window | ${link(at('activate-root', 0))} |
| Pool synced to epoch 1 | ${link(at('sync-root', 0))} |
| Claim from the command line, demo claimer 149 | ${link(at('claim-demo', 0))} |
| Claim from the browser, demo claimer 0 | ${link(at('claim-browser', 0))} |
| Epoch 2 proposed | ${link(at('propose-root', 1))} |
| Epoch 2 cancelled by the guardian | ${link(at('cancel-pending', 0))} |
| Epoch 3 proposed | ${link(at('propose-root', 2))} |
| Epoch 3 activated | ${link(at('activate-root', 1))} |
| Pool synced to epoch 3 | ${link(at('sync-root', 1))} |
| Epoch 3 claim, only the difference | ${link(at('claim-demo-delta', 0))} |
| Registry opens the push window | ${link(at('open-push', 0))} |
| Operator push | ${link(at('push', 0))} |

Every transaction can be read back with \`npx tsx scripts/tx.ts ${net} <txid>\`.

## A judge's first minute

Open the page, paste any token-aware address, press **Claim**. The browser signs with a published demo key, pays the fee from that key's float and broadcasts over a public Electrum socket. The tokens land in the judge's own wallet. No relayer, no per-IP cap, no server. Then press **Recompute from the API**: the page re-fetches the pinned URL, rebuilds the tree, and shows MATCH against the root on chain; a second button flips one digit of the snapshot and shows the red MISMATCH.

## How a claim works

Leaf: \`sha256(0x00 | method | identity | cumulative as 8 bytes)\`. Node: \`sha256(0x01 | left | right)\`. \`cumulative\` is the total earned since the first epoch, so a claim pays \`cumulative - already\` and a folder can skip epochs.

| Method | Identity | Who submits | Where the tokens go |
|---|---|---|---|
| 0 | locking bytecode of a BCH or token-aware address | anyone | exactly that locking bytecode |
| 1 | hash160 of a public key (the legacy \`1...\` address) | anyone who holds the key | the destination the key owner chose; the signature covers every output |

The receipt is a SolidCash verified mapping \`claimed[sha256(method | identity)]\`: one entry per leaf holding the cumulative total already paid. Double claims fail in the covenant (\`NothingToClaim\`), a relayer cannot redirect a method 1 payout, and a forged leaf, index, proof, token or receipt key fails \`BadProof\`, \`WrongToken\` or the receipt check.

## Root authority

- Two of three operator keys propose a root together with the SHA-256 of the exact API response it was built from (\`${R(/function proposeRoot/)}\`).
- The proposal waits \`rootDelay\` of relative time on the registry's own UTXO (\`${R(/require\(this\.age >= rootDelay/)}\`). The chain enforces the lock, so no key can shorten it.
- A separate guardian key can cancel a pending root during the window and can never propose (\`${R(/function cancelPending/)}\`). Cancelled epochs are burned.
- While a proposal is pending no second one is accepted, so the operator cannot restart the window.
- Activation is permissionless (\`${R(/function activateRoot/)}\`). The pool copies only the active root (\`${P(/function syncRoot/)}\`).

## Operator push

After the registry has held an active root idle for \`pushDelay\` (\`${R(/function openPush/)}\`), the operator may pay leaves that never claimed, only to the leaf's own identity and only for payouts of at least 1,000 base units (\`${P(/function push/)}\`). A pushed leaf is settled in the same receipt, so the owner cannot be paid twice.

## Cost

Measured claim size under production limits, by proof depth (real accepted claims, \`docs/depth-analysis.json\`): ${depth.map((x: any) => `depth ${x.depth} ${x.claimTxBytes.toLocaleString('en-US')} B`).join(', ')}. A 256 leaf tree claims in ${d8.toLocaleString('en-US')} bytes. The folder pays that fee when they claim; the operator's cost per epoch is one proposal (about 4.7 kB), one activation and one sync, whatever the number of folders. Pushing one payment per folder costs the operator at least 148 + 34 bytes per folder per epoch plus dust, so pull is cheaper for the operator from 26 folders upward. Measured on ${net}: a claim is ${claimFact?.bytes?.toLocaleString('en-US')} bytes and paid ${claimFact?.fee?.toLocaleString('en-US')} sats at ${claimFact?.satPerByte} sat/byte; a proposal is ${proposeFact?.bytes?.toLocaleString('en-US')} bytes (${proposeFact?.fee?.toLocaleString('en-US')} sats), an activation ${activateFact?.bytes?.toLocaleString('en-US')} bytes, a sync ${syncFact?.bytes?.toLocaleString('en-US')} bytes. The page prints the figures read from the transactions above.

## SolidCash features

| Feature | Where |
|---|---|
| Stateful contracts, constructor arguments | \`${R(/^contract RootRegistry/)}\`, \`${P(/^contract FoldClaimPool/)}\` |
| Verified mapping | \`${P(/mapping\(bytes32/)}\` |
| Token container: deposit, transfer | \`${P(/function fund/)}\`, \`${P(/\.transfer\(identity, owed\)/)}\` |
| Cross-contract state read through an interface | \`${P(/^interface IRootRegistry/)}\`, \`${P(/function syncRoot/)}\` |
| Relative timelock (\`this.age\`) | \`${R(/require\(this\.age >= rootDelay/)}\`, \`${R(/require\(this\.age >= pushDelay/)}\` |
| \`checkMultiSig\` and \`checkSig\` | \`${R(/checkMultiSig/)}\`, \`${P(/require\(checkSig\(s, pk\)\)/)}\` |
| Modifiers | \`${R(/modifier twoOfThree/)}\`, \`${R(/modifier onlyGuardian/)}\` |
| Enum | \`${R(/^enum Status/)}\` |
| Events, read back in tests | \`${R(/^event Proposed/)}\`, \`${P(/^event Claimed/)}\` |
| Custom errors | \`${R(/^error NotPending/)}\`, \`${P(/^error WrongToken/)}\` |
| Internal functions, loops | \`${P(/function walk/)}\`, \`${P(/function settle/)}\`, \`${P(/for \(int k/)}\` |
| Constants | \`${P(/int constant MAX_DEPTH/)}\` |
| Locking bytecode construction | \`${P(/new LockingBytecodeP2PKH/)}\` |

## Tests

${counts.passed} of ${counts.total} SolidHat tests pass on a mock network that enforces the BCH production limits (10,000 byte inputs, 100,000 byte transactions, dust and relay rules). ${mut.filter((m: any) => m.verdict === 'killed').length} of ${mut.length} guard mutations are killed: break the guard, the named test turns red, restore it, green. See TESTS.md.

## Run it

\`\`\`bash
npm install
npx solidhat test                      # contracts, claims, forged claims, depth, snapshot
npx tsx scripts/run.ts <net> status    # read the live registry and pool
npm run web:build                      # static site in web/dist
\`\`\`

Layout: \`contracts/\` (SolidCash), \`src/\` (Merkle tree, snapshot builder, pool client), \`scripts/\` (chain driver, faucet, mutation harness), \`test/\`, \`web/\`, \`docs/RUNBOOK.md\`, \`upstream/\`.

## Sponsor questions, answered on chain

| Question | Answer |
|---|---|
| Root cadence | One root per epoch; leaves are cumulative so any cadence works and folders skip epochs |
| Maximum leaves | Proof depth up to 24 (16.7 million leaves); the claim grows by 32 bytes per level (docs/depth-analysis.json) |
| Root authority | 2 of 3 operators propose, a guardian can cancel, activation is permissionless |
| Receipt layout | Verified mapping keyed by \`sha256(method | identity)\`, value is the cumulative total paid |
| Leaf contents | method byte, identity, cumulative amount |
| Link method and verification | Method 1: the signature of the key behind the legacy address; the contract checks \`hash160(pubkey)\` against the leaf and \`checkSig\` over the whole transaction |

## Upstream

Three pull-request packages for solidcash/solidcash are prepared in \`upstream/\`, each with a failing-then-passing test: the libauth git dependency that blocks \`npm install\` under \`allow-git=none\`, a Merkle pull-claim example with a showcase entry, and tests for the stateful \`this.age\` sequence. See \`upstream/README.md\`.
`;
writeFileSync(new URL('../README.md', import.meta.url), out);
console.log('README.md written');
