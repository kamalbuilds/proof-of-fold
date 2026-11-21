import { provider } from '../../src/chain.ts';
const p: any = provider('chipnet');
for (const u of await p.getUtxos(process.argv[2])) if (u.token) console.log(u.txid.slice(0, 12), u.vout, 'token', u.token.category.slice(0, 8), String(u.token.amount));
process.exit(0);
