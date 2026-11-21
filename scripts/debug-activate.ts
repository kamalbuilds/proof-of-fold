import { readFileSync } from 'node:fs';
import { signer as signerOf, provider as providerOf } from '../src/chain.ts';
import { attach, type Deployment } from '../src/pool-client.ts';
import { withRelativeLock } from '../src/relative-lock.ts';
import { setFeeRate } from '../src/fee-rate.ts';
setFeeRate(2);
const net = 'chipnet';
const d: Deployment = JSON.parse(readFileSync(new URL('../deployments/chipnet/deployment.json', import.meta.url), 'utf8'));
const p = providerOf(net);
const { registry } = attach(d, p);
const s = signerOf(net, 'DEPLOYER', p);
await withRelativeLock(d.registry.categoryId, d.rootDelay, async () => {
  const b = await registry.connect(s).call.activateRoot().build();
  const tx = (b as any).buildLibauthTransaction ? (b as any).buildLibauthTransaction(true) : null;
  console.log('version', tx?.version, 'locktime', tx?.locktime);
  for (const [i, inp] of (tx?.inputs ?? []).entries()) console.log(i, Buffer.from(inp.outpointTransactionHash).toString('hex').slice(0, 10), inp.outpointIndex, 'sequence', inp.sequenceNumber.toString(16));
});
process.exit(0);
