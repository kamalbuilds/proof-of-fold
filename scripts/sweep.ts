// Move specific confirmed outputs of one role to another role (keeps new funding off unconfirmed ancestors).
// usage: tsx scripts/sweep.ts <net> <FROM_ROLE> <TO_ROLE> <fee sats> <txid> [txid ...]
import { TransactionBuilder } from '@solidcash/solidcash';
import { signer as signerOf, provider as providerOf } from '../src/chain.ts';
import { p2pkhLock } from '../src/identity.ts';
const [net, from, to, fee, ...txids] = process.argv.slice(2);
const p = providerOf(net as any);
const f = signerOf(net as any, from, p);
const t = signerOf(net as any, to, p);
const utxos = (await f.getUtxos()).filter((u) => !u.token && txids.includes(u.txid));
const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
console.log('sweeping', utxos.length, 'utxos,', String(total), 'sats');
const r = await new TransactionBuilder({ provider: p, maximumFeeSatsPerByte: 1000 }).addInputs(utxos, f.unlockP2PKH())
  .addOutput({ to: p2pkhLock(t.pkh), amount: total - BigInt(fee) } as any).send();
console.log('sweep', r.txid);
process.exit(0);
