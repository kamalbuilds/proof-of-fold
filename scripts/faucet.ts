// Chipnet faucet client for chipnet.bch.ninja: proof-of-work challenge, then claim. Public faucet, no account.
// usage: tsx scripts/faucet.ts sats <address> <sats>
//        tsx scripts/faucet.ts mint <token-aware address> <sats> <supply>
import { createHash } from 'node:crypto';

const BASE = 'https://chipnet.bch.ninja/api';
async function api(path: string, body?: unknown) {
  const r = await fetch(`${BASE}/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${data.error ?? ''}`);
  return data;
}
function solve(c: { payload: string; target: string; expires: number }): string {
  const target = BigInt('0x' + c.target);
  for (let nonce = 0n; ; nonce++) {
    const h = createHash('sha256').update(`${c.payload}:${nonce}`).digest('hex');
    if (BigInt('0x' + h) <= target) return nonce.toString();
    if (nonce % 1_000_000n === 0n && Date.now() > c.expires) throw new Error('challenge expired');
  }
}
const [mode, address, sats, supply] = process.argv.slice(2);
if (!['sats', 'mint'].includes(mode) || !address || !sats) throw new Error('usage: sats|mint <address> <sats> [supply]');
const body: any = { address, sats };
if (mode === 'mint') body.mint = { amount: supply, capability: null, commitment: '' };
const challenge = await api('challenge', body);
console.log('challenge expected hashes', challenge.expectedHashes);
const nonce = solve(challenge);
const result = await api('claim', { payload: challenge.payload, signature: challenge.signature, nonce });
console.log(JSON.stringify(result));
