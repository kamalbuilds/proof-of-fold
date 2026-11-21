// Generates TESTS.md from the mutation results, the depth analysis and the chain logs. Run after the suites.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const J = (f: string) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const mut: any[] = J('docs/MUTATIONS.json');
const depth: any[] = J('docs/depth-analysis.json');
const counts = existsSync(new URL('../docs/test-counts.json', import.meta.url)) ? J('docs/test-counts.json') : null;
const txs = (net: string) => (existsSync(new URL(`../deployments/${net}/txs.jsonl`, import.meta.url)) ? readFileSync(new URL(`../deployments/${net}/txs.jsonl`, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const killed = mut.filter((m) => m.verdict === 'killed').length;
let out = '# Tests\n\n';
if (counts) {
  out += `Run: \`npx solidhat test\` (SolidHat project, mock network with BCH production limits: 10,000 byte inputs, 100,000 byte transactions, 128 byte commitments, dust and relay rules). ${counts.passed} of ${counts.total} tests pass.\n\n`;
  out += '| File | Tests | Covers |\n|---|---|---|\n';
  for (const f of counts.files) out += `| ${f.file} | ${f.tests} | ${f.covers} |\n`;
  out += '\n';
}
out += `## Every guard fails when broken\n\nEach row breaks one guard in the contract source, runs the named test (red expected), restores the source and runs the same test again (green expected). ${killed} of ${mut.length} mutations are killed. Reproduce: \`npx tsx scripts/mutate.ts <id>\`. Raw output: docs/MUTATIONS.json.\n\n`;
out += '| Mutation | Guard | Test | Broken | Restored |\n|---|---|---|---|---|\n';
for (const m of mut) out += `| ${m.id} | ${m.guards} | ${m.test.replace(/\|/g, '/')} | ${m.broken.exit === 0 ? 'green (survived)' : 'red'} | ${m.restored.exit === 0 ? 'green' : 'red'} |\n`;
out += '\n## Claim size against proof depth\n\nReal claims accepted under production limits (test/depth.test.ts, docs/depth-analysis.json). Each tree level adds 32 bytes of proof.\n\n| Depth | Leaves | Claim transaction bytes |\n|---|---|---|\n';
for (const d of depth) out += `| ${d.depth} | ${d.leaves.toLocaleString('en-US')} | ${d.claimTxBytes.toLocaleString('en-US')} |\n`;
for (const net of ['chipnet', 'mainnet']) {
  const t = txs(net);
  if (!t.length) continue;
  const factsFile = new URL(`../deployments/${net}/tx-facts.json`, import.meta.url);
  const facts: Record<string, any> = existsSync(factsFile) ? Object.fromEntries(J(`deployments/${net}/tx-facts.json`).facts.map((f: any) => [f.txid, f])) : {};
  out += `\n## ${net} transactions\n\nRead back with \`npx tsx scripts/tx.ts ${net} <txid>\` (size, fee, fee rate, confirmations) and \`npx tsx scripts/tx-facts.ts ${net}\` (all of them, writes deployments/${net}/tx-facts.json).\n\n| Step | Txid | Bytes | Fee (sats) | Sat/byte | Block |\n|---|---|---|---|---|---|\n`;
  for (const x of t) { const f = facts[x.txid]; out += `| ${x.what} | ${x.txid} | ${f?.bytes ?? ''} | ${f?.fee ?? ''} | ${f?.satPerByte ?? ''} | ${f?.blockHeight ?? ''} |\n`; }
  const refusals = new URL(`../deployments/${net}/refusals.json`, import.meta.url);
  if (existsSync(refusals)) {
    out += `\n### Refusals and vetoes seen on ${net}\n\n| When | Action | Answer |\n|---|---|---|\n`;
    for (const r of J(`deployments/${net}/refusals.json`).items) out += `| ${r.when} | ${r.action} | ${r.answer.replace(/\|/g, '/')}${r.accepted ? ' ; then: ' + r.accepted : ''} |\n`;
  }
}
writeFileSync(new URL('../TESTS.md', import.meta.url), out);
console.log('TESTS.md written');
