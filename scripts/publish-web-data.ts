// Copies what the web page reads from deployments/<net>/ into web/public/data/<net>/ and writes
// web/public/data/networks.json plus web/public/data/contract-lines.json (repo-relative line refs the Authority section cites).
// Re-run after a deployment changes: tsx scripts/publish-web-data.ts
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('web/public/data/', root);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const nets: { id: string; epochs: number[] }[] = [];
for (const id of ['chipnet', 'mainnet']) {
  const src = new URL(`deployments/${id}/`, root);
  if (!existsSync(new URL('deployment.json', src))) continue;
  const names = readdirSync(src);
  const epochs = names.map((n) => /^epoch-(\d+)\.json$/.exec(n)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  if (epochs.length === 0) throw new Error(`${id}: deployment.json without an epoch file`);
  const dst = new URL(`${id}/`, out);
  mkdirSync(dst, { recursive: true });
  for (const n of names) if (/^(deployment\.json|txs\.jsonl|epoch-\d+\.json|distro-\d+\.json)$/.test(n)) cpSync(new URL(n, src), new URL(n, dst));
  nets.push({ id, epochs });
}
if (nets.length === 0) throw new Error('no deployments/<net>/deployment.json found');
writeFileSync(new URL('networks.json', out), JSON.stringify({ networks: nets }, null, 2) + '\n');

// Line refs are read from the contracts so they cannot drift from the source the page cites.
const anchors: Record<string, [string, RegExp]> = {
  twoOfThree: ['contracts/RootRegistry.scash', /modifier twoOfThree/],
  onlyGuardian: ['contracts/RootRegistry.scash', /modifier onlyGuardian/],
  proposeRoot: ['contracts/RootRegistry.scash', /function proposeRoot/],
  cancelPending: ['contracts/RootRegistry.scash', /function cancelPending/],
  activateRoot: ['contracts/RootRegistry.scash', /function activateRoot/],
  rootDelay: ['contracts/RootRegistry.scash', /this\.age >= rootDelay/],
  openPush: ['contracts/RootRegistry.scash', /function openPush/],
  pushDelay: ['contracts/RootRegistry.scash', /this\.age >= pushDelay/],
  syncRoot: ['contracts/FoldClaimPool.scash', /function syncRoot/],
  claimWithKey: ['contracts/FoldClaimPool.scash', /function claimWithKey/],
  nothingToClaim: ['contracts/FoldClaimPool.scash', /require\(cumulative > already, NothingToClaim/],
  push: ['contracts/FoldClaimPool.scash', /function push\(/],
  pushWindow: ['contracts/FoldClaimPool.scash', /pushEpoch == this\.epoch/],
  minPush: ['contracts/FoldClaimPool.scash', /require\(owed >= MIN_PUSH/],
  pushDestination: ['contracts/FoldClaimPool.scash', /LockingBytecodeP2PKH/],
};
const lines: Record<string, string | number> = {};
for (const [k, [file, re]] of Object.entries(anchors)) {
  const i = readFileSync(new URL(file, root), 'utf8').split('\n').findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`contract anchor ${k} not found in ${file}`);
  lines[k] = `${file}:${i + 1}`;
}
const min = /int constant MIN_PUSH = (\d+)/.exec(readFileSync(new URL('contracts/FoldClaimPool.scash', root), 'utf8'));
if (!min) throw new Error('MIN_PUSH not found');
lines.minPushUnits = Number(min[1]);
writeFileSync(new URL('contract-lines.json', out), JSON.stringify(lines, null, 2) + '\n');
console.log('published', nets.map((n) => `${n.id}[epochs ${n.epochs.join(',')}]`).join(' '), 'and', Object.keys(lines).length, 'contract refs');
