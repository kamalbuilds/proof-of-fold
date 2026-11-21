// Chain driver for chipnet and mainnet. State lives in deployments/<net>/. Prints txids and addresses, never a key.
//   tsx scripts/run.ts <net> status
//   tsx scripts/run.ts <net> send <FROM_ROLE> <to address|ROLE> <sats> [more outputs as address sats ...]
//   tsx scripts/run.ts <net> epoch <n> <MM-DD-YYYY start> <MM-DD-YYYY end> <whole tokens> <demoCount> <demoWholeTokens>
//   tsx scripts/run.ts <net> deploy <rootDelay> <pushDelay> <tokenCategory>
//   tsx scripts/run.ts <net> fund <whole tokens>
//   tsx scripts/run.ts <net> propose <n>
//   tsx scripts/run.ts <net> activate | sync | open-push
//   tsx scripts/run.ts <net> burners <count> <sats each>
//   tsx scripts/run.ts <net> claim-demo <i> <destination address>
//   tsx scripts/run.ts <net> claim-demo-again <i> <destination address>
//   tsx scripts/run.ts <net> push <leaf index>
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Signer, TransactionBuilder } from '@solidcash/solidcash';
import { ContractFactory } from '@solidcash/solidcash/contract-factory';
import { getDataNftLockingBytecode } from '@solidcash/solidcash/stateful';
import { signer as signerOf, provider as providerOf, key } from '../src/chain.ts';
import { addressOf, publicKey, demoKey, lockingBytecodeOfAddress, tokenAddress, hexToBin, binToHex, type Net } from '../src/keys.ts';
import { attach, ecdsaSig, artifacts, claimWithKeyCall, findLeaf, pushCall, registryArgs, type Deployment, type EpochFile } from '../src/pool-client.ts';
import { buildTree, demoEntries, distroUrl, fetchRaw, rawHash } from '../src/snapshot.ts';
import { withRelativeLock } from '../src/relative-lock.ts';
import { setFeeRate } from '../src/fee-rate.ts';
import { hash160, p2pkhLock } from '../src/identity.ts';

const [netArg, step, ...args] = process.argv.slice(2);
const net = netArg as Net;
if (!['chipnet', 'mainnet'].includes(net)) throw new Error('first argument: chipnet | mainnet');
const dir = new URL(`../deployments/${net}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (n: string) => new URL(n, dir);
const readJson = (n: string) => JSON.parse(readFileSync(file(n), 'utf8'));
const writeJson = (n: string, v: unknown) => writeFileSync(file(n), JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x), 2) + '\n');
const logTx = (what: string, txid: string, extra: Record<string, unknown> = {}) => {
  appendFileSync(file('txs.jsonl'), JSON.stringify({ at: new Date().toISOString(), net, what, txid, ...extra }) + '\n');
  console.log(what.padEnd(14), txid);
};
const logAndWait = async (what: string, txid: string, extra: Record<string, unknown> = {}) => {
  logTx(what, txid, extra);
  if (process.env.NO_WAIT !== '1') console.log('  confirmed with', await confirmed(txid), 'confirmation(s)');
};
const FEE = Number(process.env.FEE_RATE ?? (net === 'chipnet' ? 3 : 2));
setFeeRate(FEE);
/** Poll Electrum until the transaction has a confirmation: the next step spends its outputs and the registry timelocks need real blocks. */
async function confirmed(txid: string, minutes = 20) {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    const v: any = await (p as any).performRequest('blockchain.transaction.get', txid, true).catch(() => null);
    if (v?.confirmations) return v.confirmations;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`${txid} still unconfirmed after ${minutes} minutes`);
}
const dep = (): Deployment => readJson('deployment.json');
const p = providerOf(net);
const deployer = () => signerOf(net, 'DEPLOYER', p);
const rolePriv = (r: string) => key(net, r);
const whole = (s: string) => BigInt(s) * 10n ** 8n;
const toLock = (a: string) => (/^[A-Z]+$/.test(a) ? p2pkhLock(hash160(publicKey(rolePriv(a)))) : lockingBytecodeOfAddress(a));

async function sendSats(fromRole: string, outs: { lock: Uint8Array; sats: bigint }[]) {
  const from = signerOf(net, fromRole, p);
  const utxos = (await from.getUtxos()).filter((u) => !u.token);
  const total = utxos.reduce((n, u) => n + u.satoshis, 0n);
  const out = outs.reduce((n, o) => n + o.sats, 0n);
  const fee = BigInt(Math.ceil((148 * utxos.length + 34 * (outs.length + 1) + 20) * 1.1 * FEE));
  if (total < out + fee) throw new Error(`${fromRole} has ${total} sats, needs ${out + fee}`);
  const tb = new TransactionBuilder({ provider: p }).addInputs(utxos, from.unlockP2PKH());
  for (const o of outs) tb.addOutput({ to: o.lock, amount: o.sats } as any);
  const change = total - out - fee;
  if (change >= 1000n) tb.addOutput({ to: p2pkhLock(from.pkh), amount: change } as any);
  return tb.send();
}

switch (step) {
  case 'status': {
    const d = dep();
    const { registry, pool } = attach(d, p);
    const rs = await registry.getState();
    const ps = await pool.getState();
    const hx = (b: Uint8Array) => binToHex(b);
    console.log('height', await p.getBlockHeight());
    console.log('registry', d.registry.categoryId, JSON.stringify({ activeEpoch: String(rs.activeEpoch), pushEpoch: String(rs.pushEpoch), status: String(rs.status), pendingEpoch: String(rs.pendingEpoch), highEpoch: String(rs.highEpoch), activeRoot: hx(rs.activeRoot), pendingRoot: hx(rs.pendingRoot) }));
    console.log('pool', d.pool.categoryId, JSON.stringify({ epoch: String(ps.epoch), pushEpoch: String(ps.pushEpoch), root: hx(ps.root) }));
    console.log('pool tokens', String(await pool.tokens[d.tokenCategory].amount));
    break;
  }
  case 'send': {
    const [from, ...rest] = args;
    const outs = [];
    for (let i = 0; i < rest.length; i += 2) outs.push({ lock: toLock(rest[i]), sats: BigInt(rest[i + 1]) });
    const r = await sendSats(from, outs);
    await logAndWait('send', r.txid, { from, outputs: outs.length });
    break;
  }
  case 'mint-token': {
    // Genesis of a fungible test token from the deployer: the category is the txid of the vout 0 input.
    const supply = BigInt(args[0]);
    const s = deployer();
    const utxos = (await s.getUtxos()).filter((u) => !u.token && u.vout === 0 && u.satoshis >= 20_000n);
    const genesis = utxos[0];
    if (!genesis) throw new Error('deployer has no plain vout 0 utxo: send it one first');
    const fee = BigInt(250 * FEE);
    const r = await new TransactionBuilder({ provider: p })
      .addInput(genesis, s.unlockP2PKH())
      .addOutput({ to: p2pkhLock(s.pkh), amount: 1000n, token: { category: genesis.txid, amount: supply } } as any)
      .addOutput({ to: p2pkhLock(s.pkh), amount: genesis.satoshis - 1000n - fee } as any)
      .send();
    await logAndWait('mint-token', r.txid, { category: genesis.txid, supply: String(supply) });
    break;
  }
  case 'epoch': {
    const [n, startDate, endDate, amount, demoCount, demoWhole] = args;
    const w = { startDate, endDate, amount };
    const rawFile = `distro-${n}.json`;
    const raw = existsSync(file(rawFile)) ? new Uint8Array(readFileSync(file(rawFile))) : await fetchRaw(w);
    if (!existsSync(file(rawFile))) writeFileSync(file(rawFile), raw);
    const { tree, built } = buildTree(raw, demoEntries(net, Number(demoCount), whole(demoWhole)));
    const out: EpochFile = {
      epoch: Number(n), root: binToHex(tree.root), depth: tree.depth, snapshotSha256: binToHex(rawHash(raw)), url: distroUrl(w), params: { ...w, demoCount: Number(demoCount), demoWhole },
      entries: tree.entries.map((e, i) => ({ index: i, method: e.method, identity: binToHex(e.identity), cumulative: String(e.cumulative), proof: binToHex(tree.proof(i).proofBytes) })),
    };
    writeJson(`epoch-${n}.json`, out);
    console.log('epoch', n, 'leaves', tree.entries.length, 'api rows', built.rows, 'skipped', built.skipped.length, 'depth', tree.depth);
    console.log('root', out.root);
    console.log('sha256', out.snapshotSha256, out.url);
    break;
  }
  case 'deploy': {
    const [rootDelay, pushDelay, tokenCategory] = args;
    const ops = ['OPERATOR1', 'OPERATOR2', 'OPERATOR3'].map((r) => binToHex(publicKey(rolePriv(r))));
    const base = { network: net, tokenCategory, rootDelay: Number(rootDelay), pushDelay: Number(pushDelay), operators: ops, guardian: binToHex(publicKey(rolePriv('GUARDIAN'))), pusher: binToHex(publicKey(rolePriv('PUSHER'))) };
    const s = deployer();
    const regFactory = new ContractFactory(artifacts.registryArtifact, s);
    const registry: any = await regFactory.deploy(...registryArgs({ ...base } as any));
    await registry.waitForDeployment();
    await logAndWait('deploy-registry', registry.deploymentTransaction().txid, { category: registry.categoryId });
    const registryData = getDataNftLockingBytecode(registry.categoryId, hexToBin(registry.inner.lockingBytecode));
    const poolFactory = new ContractFactory(artifacts.poolArtifact, s);
    const pool: any = await poolFactory.deploy(hexToBin(tokenCategory), registryData, hexToBin(base.pusher));
    await pool.waitForDeployment();
    await logAndWait('deploy-pool', pool.deploymentTransaction().txid, { category: pool.categoryId });
    writeJson('deployment.json', { ...base, registry: { categoryId: registry.categoryId, address: registry.address, deployTxid: registry.deploymentTransaction().txid }, pool: { categoryId: pool.categoryId, address: pool.address, deployTxid: pool.deploymentTransaction().txid } });
    console.log('registry', registry.address, '\npool    ', pool.address);
    break;
  }
  case 'fund': {
    const d = dep();
    const s = deployer();
    const { pool } = attach(d, p);
    const units = whole(args[0]);
    const coins = (await s.getUtxos()).filter((u) => u.token?.category === d.tokenCategory && !u.token.nft);
    const coin = coins.sort((a, b) => Number(b.token!.amount - a.token!.amount))[0];
    if (!coin || coin.token!.amount < units) throw new Error('deployer has no token coin large enough');
    const call = pool.connect(s).call.fund(hexToBin(d.tokenCategory)).tokenContainerDeposit(d.tokenCategory, units).addInput(coin, s.unlockP2PKH());
    const rest = coin.token!.amount - units;
    if (rest > 0n) call.addOutput({ to: p2pkhLock(s.pkh), amount: 1000n, token: { category: d.tokenCategory, amount: rest } });
    const r = await call.send();
    await logAndWait('fund-pool', r.txid, { units: String(units) });
    writeJson('deployment.json', { ...d, pool: { ...d.pool, fundTxid: r.txid } });
    break;
  }
  case 'propose': {
    const d = dep();
    const e: EpochFile = readJson(`epoch-${args[0]}.json`);
    const { registry } = attach(d, p);
    const r = await registry.connect(deployer()).call.proposeRoot(ecdsaSig(rolePriv('OPERATOR1')), ecdsaSig(rolePriv('OPERATOR2')), hexToBin(e.root), hexToBin(e.snapshotSha256), BigInt(e.epoch)).send();
    await logAndWait('propose-root', r.txid, { epoch: e.epoch, root: e.root, snapshot: e.snapshotSha256 });
    break;
  }
  case 'activate': {
    const d = dep();
    const { registry } = attach(d, p);
    const r = await withRelativeLock(d.registry.categoryId, d.rootDelay, () => registry.connect(deployer()).call.activateRoot().send());
    await logAndWait('activate-root', r.txid);
    break;
  }
  case 'sync': {
    const d = dep();
    const { pool } = attach(d, p);
    const r = await pool.connect(deployer()).call.syncRoot().send();
    await logAndWait('sync-root', r.txid);
    break;
  }
  case 'open-push': {
    const d = dep();
    const { registry } = attach(d, p);
    const r = await withRelativeLock(d.registry.categoryId, d.pushDelay, () => registry.connect(deployer()).call.openPush().send());
    await logAndWait('open-push', r.txid);
    break;
  }
  case 'burners': {
    const [count, sats] = args;
    const outs = Array.from({ length: Number(count) }, (_, i) => ({ lock: p2pkhLock(hash160(publicKey(demoKey(net, i)))), sats: BigInt(sats) }));
    const r = await sendSats('DESK', outs);
    await logAndWait('fund-burners', r.txid, { count: Number(count), sats });
    break;
  }
  case 'claim-demo':
  case 'claim-demo-again': {
    const d = dep();
    const { pool } = attach(d, p);
    const cur: any = await pool.getState();
    const epochFile = readJson(`epoch-${Number(cur.epoch)}.json`) as EpochFile;
    const i = Number(args[0]);
    const priv = demoKey(net, i);
    const leaf = findLeaf(epochFile, 1, hash160(publicKey(priv)));
    if (!leaf) throw new Error('demo leaf not in the active epoch');
    const dest = lockingBytecodeOfAddress(args[1]);
    try {
      const r = await claimWithKeyCall(d, pool, p, priv, leaf, dest).send();
      await logAndWait(step, r.txid, { demo: i, cumulative: String(leaf.entry.cumulative), destination: args[1] });
    } catch (e: any) {
      if (step === 'claim-demo') throw e;
      console.log('REFUSED', String(e.message).split('\n')[0].slice(0, 300));
    }
    break;
  }
  case 'push': {
    const d = dep();
    const { pool } = attach(d, p);
    const cur: any = await pool.getState();
    const epochFile = readJson(`epoch-${Number(cur.epoch)}.json`) as EpochFile;
    const e = epochFile.entries[Number(args[0])];
    const leaf = findLeaf(epochFile, e.method, hexToBin(e.identity))!;
    const r = await pushCall(d, pool, deployer(), rolePriv('PUSHER'), leaf).send();
    await logAndWait('push', r.txid, { index: Number(args[0]) });
    break;
  }
  default: throw new Error(`unknown step ${step}`);
}
process.exit(0);
