// Re-submits an already confirmed transaction and prints what the node answers (double-spend / replay evidence).
import { provider } from '../../src/chain.ts';
const [net, txid] = process.argv.slice(2);
const p: any = provider(net as any);
const hex = await p.getRawTransaction(txid);
try { const r = await p.sendRawTransaction(hex); console.log('ACCEPTED (unexpected)', r); } catch (e: any) { console.log('NODE SAYS:', String(e.message ?? e).replace(/\s+/g, ' ').slice(0, 300)); }
process.exit(0);
