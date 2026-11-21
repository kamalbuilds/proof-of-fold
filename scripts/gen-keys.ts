// Generates the deployer, operator (2-of-3), guardian, pusher and demo-desk keys for chipnet and mainnet into .env.
// Refuses to overwrite. Prints addresses only, never a key.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { newPrivateKey, addressOf, binToHex, type Net } from '../src/keys.ts';

const ENV = new URL('../.env', import.meta.url);
const ROLES = ['DEPLOYER', 'OPERATOR1', 'OPERATOR2', 'OPERATOR3', 'GUARDIAN', 'PUSHER', 'DESK'];
const have = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
const lines: string[] = [];
for (const net of ['chipnet', 'mainnet'] as Net[]) {
  for (const role of ROLES) {
    const name = `${net.toUpperCase()}_${role}_KEY`;
    if (new RegExp(`^${name}=`, 'm').test(have)) continue;
    lines.push(`${name}=${binToHex(newPrivateKey())}`);
  }
}
if (lines.length) appendFileSync(ENV, lines.join('\n') + '\n', { mode: 0o600 });
const env = Object.fromEntries(readFileSync(ENV, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
console.log(`wrote ${lines.length} new key(s) to .env`);
for (const net of ['chipnet', 'mainnet'] as Net[]) {
  for (const role of ROLES) console.log(net.padEnd(8), role.padEnd(10), addressOf(hex(env[`${net.toUpperCase()}_${role}_KEY`]), net));
}
