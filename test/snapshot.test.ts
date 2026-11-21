import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEntries, buildTree, demoEntries, toBaseUnits, rawHash, parseDistro } from '../src/snapshot.js';
import { bytesToHex, rootFromProof } from '../src/merkle.js';
import { hash160 } from '../src/identity.js';
import { demoKey, publicKey } from '../src/keys.js';
import { encodeBase58Address } from '@bitauth/libauth';
import { sha256 } from '@noble/hashes/sha2.js';

const raw = new Uint8Array(readFileSync(new URL('./fixtures/distro-2026-11-01_2026-11-20.json', import.meta.url)));

describe('GetDistro snapshot', () => {
  it('reads decimal amounts exactly', () => {
    expect(toBaseUnits('300554.94300812')).toBe(30055494300812n);
    expect(toBaseUnits('8.60680584')).toBe(860680584n);
    expect(toBaseUnits('5')).toBe(500000000n);
    expect(toBaseUnits('0.123456789')).toBe(12345678n);
    expect(() => toBaseUnits('1e-7')).toThrow();
  });
  it('turns every real row of the live window into a method 1 leaf, none skipped', () => {
    const b = buildEntries(raw);
    expect(b.rows).toBe(56);
    expect(b.skipped).toEqual([]);
    expect(b.entries).toHaveLength(56);
    expect(b.entries.every((e) => e.method === 1 && e.identity.length === 20)).toBe(true);
    // the first row's legacy address 18SjyNbF8VdXaNAFCVfG4rAHUyvtdmoFvX is a known hash160
    const first = b.entries.find((e) => e.cumulative === 30055494300812n);
    expect(first).toBeDefined();
    // the sum of the leaves matches the API's own total within one base unit per row
    const total = 1_000_000n * 10n ** 8n;
    expect(b.totalUnits <= total && total - b.totalUnits < 56n).toBe(true);
  });
  it('the tree root is reproducible from the stored response and changes when one byte of the response changes', () => {
    const demo = demoEntries('chipnet', 10, 100n * 10n ** 8n);
    const a = buildTree(raw, demo).tree;
    const b = buildTree(raw, demo).tree;
    expect(bytesToHex(a.root)).toBe(bytesToHex(b.root));
    const text = new TextDecoder().decode(raw).replace('"amount":300554.94300812', '"amount":300554.94300813');
    expect(text).not.toBe(new TextDecoder().decode(raw));
    const tampered = new TextEncoder().encode(text);
    expect(bytesToHex(buildTree(tampered, demo).tree.root)).not.toBe(bytesToHex(a.root));
    expect(bytesToHex(rawHash(tampered))).not.toBe(bytesToHex(rawHash(raw)));
  });
  it('every proof of the tree recomputes the root, and demo leaves are claimable by their published key', () => {
    const demo = demoEntries('chipnet', 5, 7n);
    const { tree } = buildTree(raw, demo);
    for (let i = 0; i < tree.entries.length; i++) expect(bytesToHex(rootFromProof(tree.entries[i], tree.proof(i)))).toBe(bytesToHex(tree.root));
    const pkh = hash160(publicKey(demoKey('chipnet', 3)));
    expect(tree.indexOf({ method: 1, identity: pkh })).toBeGreaterThanOrEqual(0);
  });
  it('a legacy 1... address made from a key classifies to the hash160 that key signs for on BCH', () => {
    const priv = demoKey('chipnet', 42);
    const pkh = hash160(publicKey(priv));
    const legacy = encodeBase58Address('p2pkh', pkh, { hash: (b: Uint8Array) => sha256(b) } as any);
    expect(legacy.startsWith('1')).toBe(true);
    const body = new TextEncoder().encode(JSON.stringify({ distro: [{ amount: 7, bitcoinAddress: legacy }], success: true }));
    const b = buildEntries(body);
    expect(b.entries).toHaveLength(1);
    expect(b.entries[0].method).toBe(1);
    expect(bytesToHex(b.entries[0].identity)).toBe(bytesToHex(pkh));
    expect(b.entries[0].cumulative).toBe(700000000n);
  });

  it('merges rows that share an address, lists unpayable rows, and refuses a failed response', () => {
    const synth = (rows: any[]) => new TextEncoder().encode(JSON.stringify({ distro: rows, success: true }).replace(/"amount":"([^"]+)"/g, '"amount":$1'));
    const a = '18SjyNbF8VdXaNAFCVfG4rAHUyvtdmoFvX';
    const b = buildEntries(synth([
      { amount: '1.5', bitcoinAddress: a }, { amount: '2.5', bitcoinAddress: a },
      { amount: '9', bitcoinAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' }, { amount: '1', slpAddress: 'simpleledger:qq' },
    ]));
    expect(b.entries).toHaveLength(1);
    expect(b.entries[0].cumulative).toBe(400000000n);
    expect(b.skipped.map((s) => s.reason)).toEqual(['legacy P2SH address: no key to prove the link', 'SLP-only address']);
    expect(() => parseDistro(new TextEncoder().encode('{"success":false,"distro":[]}'))).toThrow(/did not succeed/);
  });
});
