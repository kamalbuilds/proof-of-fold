// Child-pays-for-parent: spend the newest unconfirmed plain output of a role with a large fee so the whole unconfirmed
// chain it hangs from is mined. usage: tsx scripts/cpfp.ts <net> <ROLE> <fee sats>
import { TransactionBuilder } from '@solidcash/solidcash';
import { signer as signerOf, provider as providerOf } from '../src/chain.ts';
import { p2pkhLock } from '../src/identity.ts';
const [net, role, fee, parentTxid] = process.argv.slice(2);
const p = providerOf(net as any);
const s = signerOf(net as any, role, p);
const utxos = (await s.getUtxos()).filter((u) => !u.token && u.satoshis > BigInt(fee) + 600n && (!parentTxid || u.txid === parentTxid));
const u = utxos.sort((a, b) => Number(b.satoshis - a.satoshis))[0];
if (!u) throw new Error('no plain utxo large enough');
const r = await new TransactionBuilder({ provider: p, maximumFeeSatsPerByte: 100000 })
  .addInput(u, s.unlockP2PKH())
  .addOutput({ to: p2pkhLock(s.pkh), amount: u.satoshis - BigInt(fee) } as any)
  .send();
console.log('cpfp child', r.txid, 'spends', u.txid.slice(0, 8), 'fee', fee);
process.exit(0);
