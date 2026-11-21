import { provider } from '../src/chain.ts';
const net = process.argv[2] ?? 'chipnet';
const p: any = (await import('@solidcash/solidcash/network/electrum')).ElectrumNetworkProvider ? new (await import('@solidcash/solidcash/network/electrum')).ElectrumNetworkProvider(net as any) : provider(net as any);
const tip = await p.getBlockHeight();
console.log(net, 'tip', tip);
try { console.log('fee histogram [feerate, vbytes]', JSON.stringify(await p.performRequest('mempool.get_fee_histogram')), 'relayfee', await p.performRequest('blockchain.relayfee')); } catch (e: any) { console.log('hist err', e.message); }
const hs: number[] = [];
for (let h = tip - 12; h <= tip; h++) { const hdr: string = await p.performRequest('blockchain.block.header', h); hs.push(parseInt(hdr.slice(136, 144).match(/../g)!.reverse().join(''), 16)); }
console.log('block gaps (s):', hs.map((t, i) => (i ? t - hs[i - 1] : 0)).join(' '));
process.exit(0);
