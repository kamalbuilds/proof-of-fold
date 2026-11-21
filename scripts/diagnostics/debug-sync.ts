import { readFileSync } from 'node:fs';
import { signer as signerOf, provider as providerOf } from '../../src/chain.ts';
import { attach, type Deployment } from '../../src/pool-client.ts';
import { setFeeRate } from '../../src/fee-rate.ts';
setFeeRate(2);
const d: Deployment = JSON.parse(readFileSync(new URL('../../deployments/chipnet/deployment.json', import.meta.url), 'utf8'));
const p = providerOf('chipnet');
const { pool } = attach(d, p);
const s = signerOf('chipnet', 'DEPLOYER', p);
try {
  const b: any = await pool.connect(s).call.syncRoot().build();
  const tx = b.buildLibauthTransaction(true);
  console.log('inputs', tx.inputs.length, 'outputs', tx.outputs.length);
  for (const [i, inp] of tx.inputs.entries()) console.log('in', i, Buffer.from(inp.outpointTransactionHash).toString('hex').slice(0, 10), inp.outpointIndex);
  for (const [i, o] of tx.outputs.entries()) console.log('out', i, String(o.valueSatoshis));
} catch (e: any) { console.log('ERR', String(e.message).slice(0, 400)); }
process.exit(0);
