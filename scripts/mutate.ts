// Mutation proof: break one guard at a time, require a red test, restore, require green. Writes docs/MUTATIONS.json.
// usage: tsx scripts/mutate.ts [id ...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

type M = { id: string; file: string; find: string; replace: string; test: string; pattern: string; guards: string };
const REG = 'contracts/RootRegistry.scash';
const POOL = 'contracts/FoldClaimPool.scash';
const MUTATIONS: M[] = [
  { id: 'reg-multisig', file: REG, find: 'require(checkMultiSig([a, b], [op1, op2, op3]));', replace: 'require(checkSig(a, op1));', test: 'test/registry.test.ts', pattern: 'refuses one operator key', guards: '2-of-3 operator signatures on proposeRoot' },
  { id: 'reg-window', file: REG, find: 'require(this.age >= rootDelay, AuditWindowOpen(rootDelay));', replace: '', test: 'test/registry.test.ts', pattern: 'activates only after', guards: 'audit window before activation' },
  { id: 'reg-guardian', file: REG, find: 'require(checkSig(g, guardian));', replace: 'require(true);', test: 'test/registry.test.ts', pattern: 'only the guardian may cancel', guards: 'guardian-only cancel' },
  { id: 'reg-pending', file: REG, find: 'require(this.status == Status.Idle, AlreadyPending(this.pendingEpoch));', replace: '', test: 'test/registry.test.ts', pattern: 'refuses a second proposal', guards: 'no second proposal while one is pending' },
  { id: 'reg-epoch', file: REG, find: 'require(epoch > this.highEpoch, EpochNotIncreasing(epoch, this.highEpoch));', replace: '', test: 'test/registry.test.ts', pattern: 'epoch is burned', guards: 'epochs strictly increase, cancelled ones burn' },
  { id: 'reg-push-age', file: REG, find: 'require(this.age >= pushDelay, AuditWindowOpen(pushDelay));', replace: '', test: 'test/registry.test.ts', pattern: 'push window', guards: 'push window opens only after pushDelay idle blocks' },
  { id: 'pool-proof', file: POOL, find: 'require(walk(leaf, proof, index) == this.root, BadProof());', replace: '', test: 'test/pool.test.ts', pattern: 'refuses every forged claim', guards: 'Merkle proof against the active root' },
  { id: 'pool-receipt-key', file: POOL, find: 'require(leafKey == sha256(method + identity), "wrong receipt key");', replace: '', test: 'test/pool.test.ts', pattern: 'refuses every forged claim', guards: 'receipt key is the hash of the leaf identity' },
  { id: 'pool-already', file: POOL, find: 'require(cumulative > already, NothingToClaim(cumulative, already));', replace: '', test: 'test/pool.test.ts', pattern: 'lower cumulative total', guards: 'a leaf pays only cumulative minus already paid' },
  { id: 'pool-negative', file: POOL, find: 'require(index >= 0, "negative index");', replace: '', test: 'test/pool.test.ts', pattern: 'refuses every forged claim', guards: 'non-negative leaf index' },
  { id: 'pool-keysig', file: POOL, find: 'require(checkSig(s, pk));', replace: '', test: 'test/pool.test.ts', pattern: 'refuses a stranger', guards: 'legacy key signature on claimWithKey' },
  { id: 'pool-pusher', file: POOL, find: 'require(checkSig(s, pusher));', replace: '', test: 'test/pool.test.ts', pattern: 'refuses small payouts and outsiders', guards: 'operator signature on push' },
  { id: 'pool-push-window', file: POOL, find: 'require(this.pushEpoch == this.epoch, "push window not open for this epoch");', replace: '', test: 'test/pool.test.ts', pattern: 'is refused until the registry', guards: 'push only inside the registry push window' },
  { id: 'pool-push-min', file: POOL, find: 'require(owed >= MIN_PUSH, "below the push minimum");', replace: '', test: 'test/pool.test.ts', pattern: 'refuses small payouts and outsiders', guards: 'push minimum' },
  { id: 'pool-sync', file: POOL, find: 'require(active > this.epoch || pushed > this.pushEpoch, "already in sync");', replace: '', test: 'test/pool.test.ts', pattern: 'never reads a pending root', guards: 'sync only when the registry has something new' },
  { id: 'pool-token', file: POOL, find: '    function claim(bytes32 category, bytes identity, bytes32 leafKey, bigint cumulative, bytes proof, int index) {\n        require(category == rewardCategory, WrongToken());', replace: '    function claim(bytes32 category, bytes identity, bytes32 leafKey, bigint cumulative, bytes proof, int index) {', test: 'test/pool.test.ts', pattern: 'refuses every forged claim', guards: 'reward category check on claim (defence in depth: the container only holds the reward token)' },
  { id: 'pool-depth', file: POOL, find: 'require(depth <= MAX_DEPTH, "proof too deep");', replace: '', test: 'test/pool.test.ts', pattern: 'deeper than 24', guards: 'proof depth bound (op-cost guard)' },
];

const only = process.argv.slice(2);
const results: any[] = existsSync('docs/MUTATIONS.json') ? JSON.parse(readFileSync('docs/MUTATIONS.json', 'utf8')) : [];
const runTest = (m: M) => {
  const r = spawnSync('npx', ['solidhat', 'test', m.test, '-t', m.pattern], { encoding: 'utf8', timeout: 900_000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const tail = out.split('\n').filter((l) => /Tests |FAIL|Error|failed|passed/.test(l)).slice(-6).join(' | ');
  return { exit: r.status, tail: tail.slice(0, 500), compileError: /Compilation failed|Error compiling/.test(out) };
};
for (const m of MUTATIONS) {
  if (only.length && !only.includes(m.id)) continue;
  const original = readFileSync(m.file, 'utf8');
  if (!original.includes(m.find)) throw new Error(`${m.id}: anchor not found`);
  let red: any, green: any;
  try {
    writeFileSync(m.file, original.replace(m.find, () => m.replace));
    red = runTest(m);
  } finally { writeFileSync(m.file, original); }
  green = runTest(m);
  const row = { id: m.id, guards: m.guards, test: `${m.test} -t "${m.pattern}"`, broken: { exit: red.exit, compileError: red.compileError, tail: red.tail }, restored: { exit: green.exit, tail: green.tail }, verdict: red.exit !== 0 && !red.compileError && green.exit === 0 ? 'killed' : red.exit === 0 ? 'SURVIVED' : 'inconclusive' };
  const i = results.findIndex((x) => x.id === m.id);
  if (i >= 0) results[i] = row; else results.push(row);
  writeFileSync('docs/MUTATIONS.json', JSON.stringify(results, null, 2) + '\n');
  console.log(row.id.padEnd(18), row.verdict);
}
