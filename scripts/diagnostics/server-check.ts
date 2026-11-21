import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
for (const host of process.argv.slice(2)) {
  try {
    const p: any = new ElectrumNetworkProvider('chipnet' as any, { hostname: host } as any);
    const tip = await Promise.race([p.getBlockHeight(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 20000))]);
    let c: any = '?';
    try { const v: any = await p.performRequest('blockchain.transaction.get', 'd51db6e2b8788a73e7be747fab4354c14cd786f7f70e1e9ba687a94f1151ee27', true); c = v.confirmations ?? 0; } catch (e: any) { c = 'err ' + e.message.slice(0, 40); }
    const hist: any = await p.performRequest('mempool.get_fee_histogram').catch(() => null);
    console.log(host, 'tip', tip, 'propose confirmations', c, 'mempool bytes>=1', hist?.at(-1)?.[1]);
  } catch (e: any) { console.log(host, 'ERR', String(e.message).slice(0, 80)); }
}
process.exit(0);
