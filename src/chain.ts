// Shared chain plumbing for the CLI scripts: env keys, network provider, signers.
import { readFileSync, existsSync } from 'node:fs';
import { Signer } from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { hexToBin, type Net } from './keys.ts';

export function loadEnv(): Record<string, string> {
  const f = new URL('../.env', import.meta.url);
  if (!existsSync(f)) throw new Error('.env missing: run scripts/gen-keys.ts');
  return Object.fromEntries(readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
// chipnet.bch.ninja (the SDK default) keeps a stale mempool of unmined 1 sat/byte transactions; chipnet.imaginary.cash does not.
export const SERVERS: Record<Net, string | undefined> = { chipnet: 'chipnet.imaginary.cash', mainnet: undefined };
export const provider = (net: Net) => (SERVERS[net] ? new ElectrumNetworkProvider(net, { hostname: SERVERS[net] } as any) : new ElectrumNetworkProvider(net));
export function key(net: Net, role: string): Uint8Array {
  const v = loadEnv()[`${net.toUpperCase()}_${role}_KEY`];
  if (!v) throw new Error(`no ${net} ${role} key in .env`);
  return hexToBin(v);
}
export const signer = (net: Net, role: string, p = provider(net)) => new Signer(key(net, role), p);
