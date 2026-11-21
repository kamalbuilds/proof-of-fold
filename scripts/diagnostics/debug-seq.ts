import { TransactionBuilder } from '@solidcash/solidcash';
import { signer as signerOf, provider as providerOf } from '../../src/chain.ts';
import { p2pkhLock } from '../../src/identity.ts';
const p: any = providerOf('chipnet'); const s = signerOf('chipnet', 'DEPLOYER', p);
const tip = await p.getBlockHeight();
const us = (await s.getUtxos()).filter((x: any) => !x.token && x.blockHeight > 0).sort((a: any, b: any) => a.blockHeight - b.blockHeight);
const u: any = us[0];
console.log('tip', tip, 'coin height', u.blockHeight, 'age by index', tip + 1 - u.blockHeight, 'value', String(u.satoshis));
const seq = Number(process.argv[2] ?? 6);
try {
  const r = await new TransactionBuilder({ provider: p }).addInput(u, s.unlockP2PKH(), { sequence: seq }).addOutput({ to: p2pkhLock(s.pkh), amount: u.satoshis - 900n } as any).send();
  console.log('accepted with sequence', seq, r.txid);
} catch (e: any) { console.log('rejected:', String(e.message).replace(/\n/g, ' ').slice(0, 160)); }
process.exit(0);
