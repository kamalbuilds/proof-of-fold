// Reads every transaction in deployments/<net>/txs.jsonl back from Electrum: size, fee, rate, block height. Writes tx-facts.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { provider } from '../src/chain.ts';
const net = process.argv[2];
const p: any = provider(net as any);
const dir = new URL(`../deployments/${net}/`, import.meta.url);
const txs = readFileSync(new URL('txs.jsonl', dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const tip = await p.getBlockHeight();
const sat = (btc: number) => Math.round(btc * 1e8);
const facts: any[] = [];
for (const t of txs) {
  const v: any = await p.performRequest('blockchain.transaction.get', t.txid, true);
  let inSum = 0;
  for (const i of v.vin) { const pr: any = await p.performRequest('blockchain.transaction.get', i.txid, true); inSum += sat(pr.vout[i.vout].value); }
  const fee = inSum - v.vout.reduce((n: number, o: any) => n + sat(o.value), 0);
  const size = v.size ?? v.hex.length / 2;
  facts.push({ what: t.what, txid: t.txid, bytes: size, vin: v.vin.length, vout: v.vout.length, fee, satPerByte: Number((fee / size).toFixed(2)), confirmations: v.confirmations ?? 0, blockHeight: v.confirmations ? tip - v.confirmations + 1 : null });
  console.log(t.what.padEnd(16), t.txid.slice(0, 12), 'bytes', size, 'fee', fee, 'rate', (fee / size).toFixed(2), 'conf', v.confirmations ?? 0);
}
writeFileSync(new URL('tx-facts.json', dir), JSON.stringify({ readAtTip: tip, readAt: new Date().toISOString(), facts }, null, 2) + '\n');
process.exit(0);
