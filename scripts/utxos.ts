import { signer, provider } from '../src/chain.ts';
const [net, role] = process.argv.slice(2);
const p: any = provider(net as any);
const s = signer(net as any, role, p);
for (const u of await s.getUtxos()) console.log(u.txid.slice(0, 12), u.vout, String(u.satoshis), 'height', (u as any).height ?? 'n/a', u.token ? 'token ' + u.token.category.slice(0, 8) : '');
process.exit(0);
