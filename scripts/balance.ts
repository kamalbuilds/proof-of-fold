import { signer, provider } from '../src/chain.ts';
const net = (process.argv[2] ?? 'chipnet') as 'chipnet' | 'mainnet';
const p = provider(net);
try {
  for (const role of ['DEPLOYER', 'DESK', 'OPERATOR1', 'GUARDIAN', 'PUSHER']) {
    const s = signer(net, role, p);
    const utxos = await s.getUtxos();
    const sats = utxos.reduce((n, u) => n + (u.token ? 0n : u.satoshis), 0n);
    const tokens: Record<string, bigint> = {};
    for (const u of utxos) if (u.token?.amount) tokens[u.token.category] = (tokens[u.token.category] ?? 0n) + u.token.amount;
    console.log(net, role.padEnd(9), s.address, 'sats', String(sats), 'utxos', utxos.length, 'tokens', JSON.stringify(tokens, (_k, v) => (typeof v === 'bigint' ? String(v) : v)));
  }
  console.log('height', await p.getBlockHeight());
} finally { process.exit(0); }
