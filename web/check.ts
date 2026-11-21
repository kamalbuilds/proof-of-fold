// Runnable check for the page's pure logic and the published data. Run: npx tsx web/check.ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '../src/merkle.ts';
import { newPrivateKey, publicKey, tokenAddress, addressOf } from '../src/keys.ts';
import { hash160, p2pkhLock } from '../src/identity.ts';
import { parseDestination } from './src/claim.ts';
import { tamper, build } from './src/watcher.ts';

const read = (f: string) => readFileSync(new URL(`./public/data/chipnet/${f}`, import.meta.url));
const ef = JSON.parse(read('epoch-1.json').toString());
const raw = new Uint8Array(read('distro-1.json'));

// published data: the bundled snapshot rebuilds to the epoch root, and the hash is the pinned one
const mine = build(raw, 'chipnet', ef.params);
assert.equal(mine.root, ef.root, 'bundled snapshot must rebuild to the epoch root');
assert.equal(bytesToHex(sha256(raw)), ef.snapshotSha256, 'bundled snapshot must hash to the pinned sha256');

// tamper: one digit changes the hash, the root, and exactly one leaf
const t = tamper(raw);
const bad = build(t.bytes, 'chipnet', ef.params);
assert.notEqual(bad.hash, mine.hash);
assert.notEqual(bad.root, mine.root);
const diff = bad.tree.levels[0].filter((h, i) => bytesToHex(h) !== bytesToHex(mine.tree.levels[0][i])).length;
assert.equal(diff, 1, 'tamper must change exactly one leaf');

// destination rule: q addresses are refused, z addresses pass, the wrong network is refused
const priv = newPrivateKey();
const lock = p2pkhLock(hash160(publicKey(priv)));
const z = tokenAddress(lock, 'chipnet');
const q = addressOf(priv, 'chipnet');
assert.match(q, /^bchtest:q/);
assert.equal(parseDestination(z, 'chipnet').ok, true, 'token-aware address passes');
const qr: any = parseDestination(q, 'chipnet');
assert.equal(qr.ok, false, 'a q address is refused');
assert.match(qr.msg, /not token aware/);
assert.equal(parseDestination(z.split(':')[1], 'chipnet').ok, true, 'a bare payload takes the network prefix');
assert.equal(parseDestination(tokenAddress(lock, 'mainnet'), 'chipnet').ok, false, 'mainnet address refused on chipnet');
assert.equal(parseDestination('not an address', 'chipnet').ok, false);
console.log('web check ok: data rebuilds to the epoch root, tamper changes one leaf, destination rules hold');
process.exit(0);
