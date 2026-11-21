// Size and fee of a transaction, read from chain: size = raw hex length / 2, fee = sum of the spent outputs minus the outputs.
import { decodeTransaction, hexToBin, binToHex } from '@bitauth/libauth';

export type TxStats = { txid: string; bytes: number; fee: bigint; inputs: number; outputs: number; hex: string };

export async function txStats(provider: any, txid: string, knownHex?: string): Promise<TxStats> {
  const hex: string = knownHex ?? (await provider.getRawTransaction(txid));
  const tx: any = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(`cannot decode ${txid}: ${tx}`);
  let inSum = 0n;
  const parents = new Map<string, any>();
  for (const i of tx.inputs) {
    const pid = binToHex(i.outpointTransactionHash);
    if (!parents.has(pid)) {
      const p: any = decodeTransaction(hexToBin(await provider.getRawTransaction(pid)));
      if (typeof p === 'string') throw new Error(`cannot decode parent ${pid}: ${p}`);
      parents.set(pid, p);
    }
    inSum += parents.get(pid).outputs[i.outpointIndex].valueSatoshis;
  }
  const outSum = tx.outputs.reduce((n: bigint, o: any) => n + o.valueSatoshis, 0n);
  return { txid, bytes: hex.length / 2, fee: inSum - outSum, inputs: tx.inputs.length, outputs: tx.outputs.length, hex };
}
