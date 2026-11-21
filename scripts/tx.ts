// Reads a transaction back from the network over Electrum: confirmations, block height, size, fee, fee rate, token outputs.
import { provider } from '../src/chain.ts';
const [net, ...txids] = process.argv.slice(2);
const p: any = provider(net as any);
const tip = await p.getBlockHeight();
const sat = (btc: number) => Math.round(btc * 1e8);
for (const txid of txids) {
  const v: any = await p.performRequest('blockchain.transaction.get', txid, true);
  const confirmations = v.confirmations ?? 0;
  let fee: number | string = 'n/a';
  try {
    let inSum = 0;
    for (const i of v.vin) { const pr: any = await p.performRequest('blockchain.transaction.get', i.txid, true); inSum += sat(pr.vout[i.vout].value); }
    fee = inSum - v.vout.reduce((n: number, o: any) => n + sat(o.value), 0);
  } catch { /* parent not readable */ }
  const size = v.size ?? v.hex.length / 2;
  console.log(net, txid, 'bytes', size, 'vin', v.vin.length, 'vout', v.vout.length, 'tokenOutputs', v.vout.filter((o: any) => o.tokenData).length,
    'fee', fee, 'rate', typeof fee === 'number' ? (fee / size).toFixed(2) : 'n/a', 'confirmations', confirmations, 'blockHeight', confirmations ? tip - confirmations + 1 : 'mempool', 'tip', tip);
}
process.exit(0);
