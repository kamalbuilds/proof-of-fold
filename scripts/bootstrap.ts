// Bootstraps confirmed chipnet funds when the usual faucets are stuck behind unconfirmed chains: asks the
// mainnet.cash faucet (about 10,000 sats per address) for N fresh addresses, then sweeps them all in ONE child
// transaction that pays enough fee for the whole unconfirmed package (CPFP), into the role's address.
// usage: tsx scripts/bootstrap.ts <net> <ROLE> <count> <package fee sats> [index offset]
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { SignatureTemplate, TransactionBuilder } from '@solidcash/solidcash';
import { provider as providerOf, key, signer as signerOf } from '../src/chain.ts';
import { addressOf, publicKey } from '../src/keys.ts';
import { hash160, p2pkhLock } from '../src/identity.ts';

const [net, role, countArg, feeArg, startArg] = process.argv.slice(2);
const start = Number(startArg ?? 0);
const n = Number(countArg);
const root = key(net as any, role);
const boot = (i: number) => sha256(concatBytes(root, new TextEncoder().encode(`bootstrap/${start + i}`)));
const p = providerOf(net as any);
const target = signerOf(net as any, role, p);
for (let i = 0; i < n; i++) {
  const addr = addressOf(boot(i), net as any);
  const r = await fetch('https://rest-unstable.mainnet.cash/faucet/get_testnet_bch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cashaddr: addr }) });
  const j: any = await r.json();
  console.log(i, addr.slice(0, 24), j.txId ? 'faucet tx ' + j.txId.slice(0, 12) : JSON.stringify(j));
}
await new Promise((r) => setTimeout(r, 8000));
const inputs: any[] = [];
for (let i = 0; i < n; i++) {
  const addr = addressOf(boot(i), net as any);
  for (const u of await p.getUtxos(addr)) inputs.push({ ...u, unlocker: new SignatureTemplate(boot(i)).unlockP2PKH() });
}
const total = inputs.reduce((s, u) => s + u.satoshis, 0n);
console.log('swept inputs', inputs.length, 'total sats', String(total));
const fee = BigInt(feeArg);
if (total <= fee + 1000n) throw new Error('not enough to pay the package fee');
const r = await new TransactionBuilder({ provider: p, maximumFeeSatsPerByte: 100000 }).addInputs(inputs)
  .addOutput({ to: p2pkhLock(target.pkh), amount: total - fee } as any).send();
console.log('sweep tx', r.txid, 'fee', String(fee));
process.exit(0);
