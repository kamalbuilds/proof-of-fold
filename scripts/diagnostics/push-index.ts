import { readFileSync } from 'node:fs';
import { demoKey, publicKey } from '../../src/keys.ts';
import { hash160 } from '../../src/identity.ts';
import { bytesToHex } from '@noble/hashes/utils.js';
const [net, epoch, demo] = process.argv.slice(2);
const f = JSON.parse(readFileSync(new URL(`../../deployments/${net}/epoch-${epoch}.json`, import.meta.url), 'utf8'));
const id = bytesToHex(hash160(publicKey(demoKey(net as any, Number(demo)))));
const e = f.entries.find((x: any) => x.method === 1 && x.identity === id);
console.log('leaf index', e?.index, 'cumulative', e?.cumulative);
