// Reads a transaction back from the network over Electrum: confirmations, size, output count, token outputs.
import { provider } from '../src/chain.ts';
import { decodeTransaction, hexToBin, binToHex } from '@bitauth/libauth';
const [net, ...txids] = process.argv.slice(2);
const p: any = provider(net as any);
for (const txid of txids) {
  const hex = await p.getRawTransaction(txid);
  const tx: any = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(tx);
  let confirmations: unknown = 'unknown';
  try { const v = await p.getRawTransaction(txid, true); confirmations = (v as any)?.confirmations ?? 'mempool'; } catch { /* provider returns hex only */ }
  console.log(net, txid, 'bytes', hex.length / 2, 'inputs', tx.inputs.length, 'outputs', tx.outputs.length, 'tokenOutputs', tx.outputs.filter((o: any) => o.token).length, 'confirmations', confirmations);
}
process.exit(0);
