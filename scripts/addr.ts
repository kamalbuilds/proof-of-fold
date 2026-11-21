import { readFileSync } from 'node:fs';
import { hexToBin, tokenAddress, addressOf, newPrivateKey } from '../src/keys.ts';
import { p2pkhLock, hash160 } from '../src/identity.ts';
import { publicKey } from '../src/keys.ts';
// usage: tsx scripts/addr.ts <ENV_KEY_NAME> <net>   prints the plain and token-aware address (never the key)
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const [name, net] = process.argv.slice(2);
const priv = hexToBin(env[name]);
console.log(addressOf(priv, net as any), tokenAddress(p2pkhLock(hash160(publicKey(priv))), net as any));
