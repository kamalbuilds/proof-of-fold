import { provider as providerOf } from '../../src/chain.ts';
const p: any = providerOf('chipnet');
const tip = await p.getBlockHeight();
const ts = async (h: number) => { const hdr: string = await p.performRequest('blockchain.block.header', h); return parseInt(hdr.slice(136, 144).match(/../g)!.reverse().join(''), 16); };
const t0 = await ts(Number(process.argv[2])), t1 = await ts(tip);
console.log('block', process.argv[2], 'time', new Date(t0 * 1000).toISOString(), 'tip', tip, 'time', new Date(t1 * 1000).toISOString(), 'elapsed s', t1 - t0, 'now', new Date().toISOString());
process.exit(0);
