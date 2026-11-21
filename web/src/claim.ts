// Claim panel: validate a token-aware address, assign an unclaimed demo leaf, build and sign the claim in the browser,
// broadcast over Electrum, then read the receipt, the size, the fee and the destination balance back from chain.
import { Signer, TransactionBuilder } from '@solidcash/solidcash';
import { decodeCashAddress, binToHex } from '@bitauth/libauth';
import { attach, claimWithKeyCall, findLeaf, type EpochFile, type Leaf } from '../../src/pool-client.ts';
import { demoKey, publicKey, addressOf, lockingBytecodeOfAddress } from '../../src/keys.ts';
import { hash160, p2pkhLock } from '../../src/identity.ts';
import { leafKey, rootFromProof } from '../../src/merkle.ts';
import { $, NETS, FEE_RATE, esc, fmtInt, fmtTokens, isZeroRoot, loadEpoch, epochToShow, shortHex, sleep, txLink, addrLink, blocksToActivate, type Ctx, type Snap } from './chain.ts';
import { selectLeaf } from './leafview.ts';
import { txStats } from './txstats.ts';

type Claimer = { i: number; priv: Uint8Array; address: string; leaf: Leaf; claimed: bigint; sats: bigint };
type Dest = { address: string; lock: Uint8Array };

let ctx: Ctx;
let ef: EpochFile | undefined;
let claimer: Claimer | undefined;
let dest: Dest | undefined;
let busy = false;
let lastClaim: { txid: string; hex: string; claimer: Claimer; dest: Dest } | undefined;
let onClaimed: () => void = () => {};

const btn = () => $('claim-btn') as HTMLButtonElement;
const keyOf = (i: number) => demoKey(ctx.net, i);
const demoCount = () => Number((ef!.params as any).demoCount);

/** The token-aware check: a q... address would receive CashTokens into a wallet that cannot see them. */
export function parseDestination(raw: string, net: Ctx['net']): { ok: true; dest: Dest } | { ok: false; msg: string } {
  let a = raw.trim();
  if (!a) return { ok: false, msg: '' };
  if (!a.includes(':')) a = `${NETS[net].prefix}:${a}`;
  const d: any = decodeCashAddress(a);
  if (typeof d === 'string') return { ok: false, msg: 'That is not a valid CashAddress.' };
  if (d.prefix !== NETS[net].prefix) return { ok: false, msg: `This page claims on ${net}, whose addresses start with ${NETS[net].prefix}:. This address starts with ${d.prefix}:.` };
  if (d.type === 'p2pkh' || d.type === 'p2sh') {
    return { ok: false, msg: 'This address is not token aware (it starts with q or p). Tokens sent to it would be stranded in a wallet that cannot see them. Use the token-aware form that starts with z (or r for script addresses).' };
  }
  return { ok: true, dest: { address: a, lock: lockingBytecodeOfAddress(a) } };
}

const tokenBalance = async (lock: Uint8Array): Promise<bigint> => {
  const us: any[] = await ctx.provider.getUtxosForLockingBytecode(lock);
  return us.filter((u) => u.token?.category === ctx.d.tokenCategory).reduce((n, u) => n + BigInt(u.token.amount), 0n);
};
const claimedOf = async (leaf: Leaf): Promise<bigint> => BigInt(await ctx.pool.state.claimed(leafKey(leaf.entry)));
const satsOf = async (address: string): Promise<bigint> => {
  const us: any[] = await ctx.provider.getUtxos(address);
  return us.filter((u) => !u.token).reduce((n, u) => n + u.satoshis, 0n);
};

function leafFor(i: number): Leaf {
  const l = findLeaf(ef!, 1, hash160(publicKey(keyOf(i))));
  if (!l) throw new Error(`demo leaf ${i} is not in epoch ${ef!.epoch}`);
  return l;
}

async function loadClaimer(i: number): Promise<Claimer> {
  const priv = keyOf(i);
  const leaf = leafFor(i);
  const address = addressOf(priv, ctx.net);
  const [claimed, sats] = await Promise.all([claimedOf(leaf), satsOf(address)]);
  return { i, priv, address, leaf, claimed, sats };
}

/** First demo leaf from a random start whose receipt is still empty. */
async function assign(from?: number): Promise<Claimer | undefined> {
  const n = demoCount();
  const start = from ?? Math.floor(Math.random() * n);
  for (let k = 0; k < n; k++) {
    const c = await loadClaimer((start + k) % n);
    if (c.claimed === 0n) return c;
  }
  return undefined;
}

function renderClaimer() {
  const box = $('claimer');
  if (!claimer) { box.hidden = false; box.innerHTML = '<div class="row"><span class="lbl">Demo leaves</span><span>Every demo leaf has claimed.</span></div>'; return; }
  const c = claimer;
  const sym = NETS[ctx.net].symbol;
  box.hidden = false;
  box.innerHTML = `
    <div class="row"><span class="lbl">Demo leaf</span><span class="num-in"><span>#<input id="claimer-i" type="number" min="0" max="${demoCount() - 1}" value="${c.i}" aria-label="Demo leaf number"></span><button class="btn ghost" id="claimer-go" type="button">Use this number</button></span></div>
    <div class="row"><span class="lbl">Published key</span><span class="mono">${binToHex(c.priv)}<br>Derived as sha256 of the public label foldclaim-demo-claimer/${ctx.net}/${c.i}. It holds only this demo leaf and the fee sats below.</span></div>
    <div class="row"><span class="lbl">Key address</span><span>${addrLink(ctx, c.address)} <span class="mono">${fmtInt(c.sats)} sats for the fee</span></span></div>
    <div class="row"><span class="lbl">Leaf</span><span>${fmtTokens(c.leaf.entry.cumulative)} ${sym} cumulative \u00b7 leaf index ${c.leaf.index} \u00b7 proof depth ${c.leaf.proof.length / 32} \u00b7 method 1 (key signs)</span></div>
    <div class="row"><span class="lbl">Receipt</span><span>${c.claimed === 0n ? 'unclaimed' : `claimed ${fmtTokens(c.claimed)} ${sym}`}</span></div>`;
  $('claimer-go').addEventListener('click', async () => {
    const v = Number(($('claimer-i') as HTMLInputElement).value);
    if (!Number.isInteger(v) || v < 0 || v >= demoCount()) return;
    await setClaimer(await loadClaimer(v), true);
  });
  $('claim-next').hidden = false;
}

async function setClaimer(c: Claimer | undefined, plate = false) {
  claimer = c;
  renderClaimer();
  if (plate) showOnPlate();
  refreshButton();
}
const showOnPlate = () => { if (claimer && ef) selectLeaf(ctx, ef, claimer.leaf.index, `demo leaf ${claimer.i}`); };

/** What stops a claim right now, from the chain snapshot. */
function gate(s: Snap): { open: boolean; html: string; sync: boolean } {
  const rd = ctx.d.rootDelay;
  if (s.poolEpoch >= 1 && !isZeroRoot(s.poolRoot)) {
    if (s.activeEpoch > s.poolEpoch) {
      return { open: true, sync: true, html: `<p>The registry holds a newer active epoch (${s.activeEpoch}). The pool still pays against epoch ${s.poolEpoch}. Syncing is permissionless.</p>` };
    }
    return { open: true, sync: false, html: '' };
  }
  if (s.activeEpoch >= 1) {
    return { open: false, sync: true, html: `<p>The registry activated epoch ${s.activeEpoch} and the pool has not copied its root yet. Claims open as soon as the pool syncs. Syncing is permissionless and is paid by the demo key above.</p>` };
  }
  if (s.status === 1) {
    const b = blocksToActivate(s, rd);
    const when = !b.confirmed ? `The proposal is waiting for its first confirmation, then the ${rd} block audit window runs.` : b.left > 0 ? `${b.left} of ${rd} audit window blocks remain.` : 'The audit window has elapsed and activation is open to anyone.';
    return { open: false, sync: false, html: `<p>Epoch ${s.pendingEpoch} (root ${shortHex(s.pendingRoot, 10, 6)}) is pending in the registry. ${when} Claims open after the registry activates the root and the pool syncs. The proof below already verifies against the pending root.</p>` };
  }
  return { open: false, sync: false, html: '<p>The registry has no root yet.</p>' };
}

function renderGate() {
  const s = ctx.snap;
  const box = $('claim-gate');
  if (!s) return;
  const g = gate(s);
  if (!g.html) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = g.html + (g.sync ? '<p><button class="btn" id="sync-btn" type="button">Sync the pool to the active epoch</button></p>' : '');
  if (g.sync) $('sync-btn').addEventListener('click', doSync);
}

function refreshButton() {
  const s = ctx?.snap;
  const open = !!s && gate(s).open;
  btn().disabled = busy || !(open && dest && claimer && claimer.claimed === 0n);
}

/** Called after every chain refresh. */
export async function onSnap() {
  const s = ctx.snap!;
  const want = epochToShow(ctx, s);
  if (!ef || ef.epoch !== want) {
    ef = await loadEpoch(ctx, want);
    await setClaimer(await assign());
  }
  renderGate();
  refreshButton();
}

// ---- progress log
type Step = { done: (detail?: string) => void; fail: (detail: string) => void; warn: (detail: string) => void };
function step(label: string): Step {
  const li = document.createElement('li');
  li.className = 'active';
  const t0 = performance.now();
  li.innerHTML = `${esc(label)}<span class="t"></span><span class="d"></span>`;
  $('steps').appendChild(li);
  const end = (cls: string, detail?: string) => {
    li.className = cls;
    li.querySelector('.t')!.textContent = `${Math.round(performance.now() - t0)} ms`;
    if (detail) li.querySelector('.d')!.textContent = detail;
  };
  return { done: (d) => end('done', d), fail: (d) => end('fail', d), warn: (d) => end('warn', d) };
}

// ---- provider wrapper: reports what the SDK does and broadcasts with a visible wait for the node
function watchedProvider(real: any, hooks: { onUtxos?: () => void; onSigned?: (hex: string) => void; onBroadcast?: (txid: string) => void; onListed?: (txid: string, ms: number) => void }) {
  const state = { broadcastTried: false, hex: '' };
  const proxy = new Proxy(real, {
    get(t, k, r) {
      if (k === 'getUtxos' || k === 'getUtxosForLockingBytecode') return (...a: any[]) => { hooks.onUtxos?.(); return t[k](...a); };
      if (k === 'sendRawTransaction') {
        return async (hex: string) => {
          state.broadcastTried = true; state.hex = hex;
          hooks.onSigned?.(hex);
          const txid: string = await t.performRequest('blockchain.transaction.broadcast', hex);
          hooks.onBroadcast?.(txid);
          t.rememberTransaction?.(txid, hex);
          t.forgetListings?.();
          const t0 = performance.now();
          for (let n = 0; n < 60; n++) {
            try { await t.performRequest('blockchain.transaction.get_height', txid); break; } catch { await sleep(250); }
          }
          t.forgetListings?.();
          hooks.onListed?.(txid, Math.round(performance.now() - t0));
          return txid;
        };
      }
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  return { proxy, state };
}

const FUNDERS = 3;

/** A claim spends three plain funding UTXOs of the signer. A key with fewer gets its coins split into three first. */
async function ensureFunders(c: Claimer): Promise<string | undefined> {
  const us: any[] = (await ctx.provider.getUtxos(c.address)).filter((u: any) => !u.token);
  if (us.length >= FUNDERS) return undefined;
  const total = us.reduce((n, u) => n + u.satoshis, 0n);
  const fee = BigInt(Math.ceil((148 * us.length + 34 * FUNDERS + 10) * 1.2 * FEE_RATE[ctx.net]));
  const share = (total - fee) / BigInt(FUNDERS);
  if (share < 1500n) throw new Error(`the demo key holds ${total} sats in ${us.length} coin(s), too little to split into ${FUNDERS} funding coins`);
  const signer = new Signer(c.priv, ctx.provider);
  const tb = new TransactionBuilder({ provider: ctx.provider }).addInputs(us, signer.unlockP2PKH());
  const lock = p2pkhLock(hash160(publicKey(c.priv)));
  for (let k = 0; k < FUNDERS; k++) tb.addOutput({ to: lock, amount: k === FUNDERS - 1 ? total - fee - share * BigInt(FUNDERS - 1) : share } as any);
  return (await tb.send()).txid;
}

const CONTENTION = /txn-mempool-conflict|missing inputs|missingorspent|already spent|conflict|double.?spend|-25\b|-26\b/i;
const cleanMsg = (e: any) => String(e?.message ?? e).replace(/\s+/g, ' ').trim().slice(0, 700);

async function doSync() {
  const sb = $('sync-btn') as HTMLButtonElement;
  sb.disabled = true;
  $('steps').innerHTML = '';
  const s = step('Syncing the pool: building syncRoot, signing with the demo key, broadcasting');
  try {
    if (!claimer) throw new Error('no demo key to pay the fee');
    await ensureFunders(claimer);
    const { pool } = attach(ctx.d, ctx.provider);
    const r = await pool.connect(new Signer(claimer.priv, ctx.provider)).call.syncRoot().send();
    s.done(`synced in ${r.txid}`);
    await onRefresh();
  } catch (e) {
    s.fail(cleanMsg(e));
    sb.disabled = false;
  }
}

let onRefresh: () => Promise<void> = async () => {};

async function doClaim() {
  if (busy || !claimer || !dest || !ef) return;
  busy = true; refreshButton();
  showOnPlate();
  await onRefresh();
  $('steps').innerHTML = '';
  $('claim-result').hidden = true; $('double').hidden = true;
  const sym = NETS[ctx.net].symbol;
  const MAX_RETRY = 3;
  try {
    let c = claimer;
    const before = await tokenBalance(dest.lock);
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      let cur = step(`Reading the pool receipt for leaf ${c.leaf.index}`);
      const [snap, receipt] = await Promise.all([ctx.snap!, claimedOf(c.leaf)]);
      if (receipt >= c.leaf.entry.cumulative) {
        cur.fail(`receipt already holds ${fmtTokens(receipt)} ${sym}: this leaf is spent. Choose another demo leaf.`);
        return;
      }
      cur.done(`claimed = ${fmtTokens(receipt)}, pool epoch ${snap.poolEpoch}, pool root ${shortHex(snap.poolRoot, 10, 6)}`);

      cur = step(`Checking the ${c.leaf.proof.length / 32} sibling proof against the pool root`);
      const sibs = Array.from({ length: c.leaf.proof.length / 32 }, (_, k) => c.leaf.proof.slice(k * 32, k * 32 + 32));
      const root = binToHex(rootFromProof(c.leaf.entry, { index: c.leaf.index, siblings: sibs }));
      if (root !== snap.poolRoot) { cur.fail(`proof root ${shortHex(root, 10, 6)} differs from the pool root ${shortHex(snap.poolRoot, 10, 6)}`); return; }
      cur.done(`root ${shortHex(root, 10, 6)} equals the pool root`);

      const split = step('Checking the demo key has three funding coins');
      try {
        const id = await ensureFunders(c);
        split.done(id ? `split into ${FUNDERS} coins in ${id}` : `${FUNDERS} or more coins present`);
      } catch (e: any) { split.fail(cleanMsg(e)); return; }
      let utxoStep: Step | undefined = step('Fetching UTXOs for the pool, the registry and the demo key');
      let signStep: Step | undefined;
      let bcStep: Step | undefined;
      let listStep: Step | undefined;
      let hex = '';
      const { proxy, state } = watchedProvider(ctx.provider, {
        onUtxos: () => { if (utxoStep) { utxoStep.done(`demo key ${c.address}`); utxoStep = undefined; signStep = step('Deriving the claim, signing locally, evaluating the covenant'); } },
        onSigned: (h) => { hex = h; signStep?.done(`${h.length / 2} bytes signed in the browser`); signStep = undefined; bcStep = step('Broadcasting over the Electrum websocket'); },
        onBroadcast: (txid) => { bcStep?.done(`accepted: ${txid}`); bcStep = undefined; listStep = step('Waiting for the node to list it'); },
        onListed: (_t, ms) => { listStep?.done(`listed after ${ms} ms`); listStep = undefined; },
      });
      const { pool } = attach(ctx.d, proxy);
      try {
        const details = await claimWithKeyCall(ctx.d, pool, proxy, c.priv, c.leaf, dest.lock).send();
        const txid: string = details.txid;
        // post-conditions that only a completed claim produces
        const done = step('Reading the receipt and the destination balance back from chain');
        ctx.provider.forgetListings?.();
        const [stats, receiptAfter, after] = await Promise.all([txStats(ctx.provider, txid, hex || details.hex), claimedOf(c.leaf), tokenBalance(dest.lock)]);
        if (receiptAfter !== c.leaf.entry.cumulative) { done.fail(`receipt reads ${fmtTokens(receiptAfter)}, expected ${fmtTokens(c.leaf.entry.cumulative)}`); return; }
        done.done(`claimed[leaf] = ${fmtTokens(receiptAfter)} ${sym}`);
        lastClaim = { txid, hex: stats.hex, claimer: c, dest };
        showResult(txid, stats.bytes, stats.fee, before, after, attempt);
        claimer = { ...c, claimed: receiptAfter };
        renderClaimer();
        onClaimed();
        return;
      } catch (e: any) {
        utxoStep?.fail(cleanMsg(e)); signStep?.fail(cleanMsg(e)); bcStep?.fail(cleanMsg(e)); listStep?.fail(cleanMsg(e));
        const msg = cleanMsg(e);
        if (CONTENTION.test(msg)) {
          if (attempt === MAX_RETRY) { step('Giving up').fail(`the pool UTXO kept moving: ${msg}`); return; }
          const w = step(`Contention: another claim spent the pool UTXO first. Rebuilding, retry ${attempt + 1} of ${MAX_RETRY}`);
          await sleep(2800);
          ctx.provider.forgetListings?.();
          w.warn(msg);
          continue;
        }
        step('Claim stopped').fail(msg);
        return;
      }
    }
  } catch (e: any) {
    step('Claim stopped').fail(cleanMsg(e));
  } finally {
    busy = false; refreshButton();
  }
}

function showResult(txid: string, bytes: number, fee: bigint, before: bigint, after: bigint, retries: number) {
  const sym = NETS[ctx.net].symbol;
  const box = $('claim-result');
  box.className = 'result'; box.hidden = false;
  box.innerHTML = `
    <h3>Claimed ${fmtTokens(after - before)} ${sym} into your wallet</h3>
    <div class="kv">
      <span class="lbl">Transaction</span><span>${txLink(ctx, txid, txid)}</span>
      <span class="lbl">Size</span><span class="mono">${fmtInt(bytes)} bytes</span>
      <span class="lbl">Fee</span><span class="mono">${fmtInt(fee)} sats (${(Number(fee) / bytes).toFixed(2)} sat/B), paid from the demo key</span>
      <span class="lbl">Destination</span><span class="mono">${esc(dest!.address)}</span>
      <span class="lbl">Token balance</span><span class="mono">${fmtTokens(before)} to ${fmtTokens(after)} ${sym} (delta +${fmtTokens(after - before)})</span>
      ${retries ? `<span class="lbl">Contention</span><span class="mono">rebuilt ${retries} time${retries > 1 ? 's' : ''} before the pool UTXO was free</span>` : ''}
    </div>`;
  $('double').hidden = false;
  $('double-out').innerHTML = '';
}

async function doDouble() {
  if (!lastClaim) return;
  const b = $('double-btn') as HTMLButtonElement;
  b.disabled = true;
  const out = $('double-out');
  out.innerHTML = '';
  const row = (who: string, what: string) => { out.insertAdjacentHTML('beforeend', `<div class="refusal"><div class="who">${esc(who)}</div><div class="what">${esc(what)}</div></div>`); };
  try {
    const { claimer: c, dest: d } = lastClaim;
    // (a) the SDK runs the covenant in its VM before it broadcasts anything. The demo key's spent coins are replaced by
    // dry-run funding coins here, so the answer comes from the covenant and not from a funding shortfall; the wrapper refuses to broadcast.
    const lock = p2pkhLock(hash160(publicKey(c.priv)));
    const coins = [1, 2, 3].map((k) => ({ txid: String(k).repeat(64), vout: 1, satoshis: 100_000n, blockHeight: 1, lockingBytecode: lock }));
    const proxy = new Proxy(ctx.provider, {
      get(t, k, r) {
        if (k === 'getUtxos') return async (a: string) => (a === c.address ? coins : t.getUtxos(a));
        if (k === 'getUtxosForLockingBytecode') return async (l: Uint8Array) => (binToHex(l) === binToHex(lock) ? coins : t.getUtxosForLockingBytecode(l));
        if (k === 'sendRawTransaction') return async () => { throw new Error('evaluation only: nothing is broadcast'); };
        const v = Reflect.get(t, k, r);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    ctx.provider.forgetListings?.();
    const { pool } = attach(ctx.d, proxy);
    try {
      await claimWithKeyCall(ctx.d, pool, proxy, c.priv, c.leaf, d.lock).send();
      row('SolidCash SDK, local covenant evaluation with dry-run funding inputs', 'The covenant accepted the second claim in the SDK VM. Nothing was broadcast.');
    } catch (e: any) {
      row('SolidCash SDK, local covenant evaluation with dry-run funding inputs (nothing is broadcast)', cleanMsg(e));
    }
    // (b) the confirmed claim transaction goes back to the node as it is
    let status = 'unknown';
    try { const h = await ctx.provider.performRequest('blockchain.transaction.get_height', lastClaim.txid); status = Number(h) > 0 ? `confirmed at height ${h}` : 'in the mempool'; } catch { status = 'not listed'; }
    try {
      const id = await ctx.provider.performRequest('blockchain.transaction.broadcast', lastClaim.hex);
      row(`Electrum node, rebroadcast of the first claim transaction (${status})`, `The node accepted it and returned ${id}. A transaction can only exist once; this is the same transaction.`);
    } catch (e: any) {
      row(`Electrum node, rebroadcast of the first claim transaction (${status})`, cleanMsg(e));
    }
  } finally { b.disabled = false; }
}

export function initClaim(c: Ctx, refresh: () => Promise<void>, claimed: (txid: string) => void) {
  ctx = c; onRefresh = refresh; onClaimed = () => claimed(lastClaim!.txid);
  const input = $('dest') as HTMLInputElement;
  const hint = $('dest-hint');
  const prefix = NETS[c.net].prefix;
  input.placeholder = `${prefix}:z...`;
  input.addEventListener('input', () => {
    const r = parseDestination(input.value, c.net);
    if (r.ok) { dest = r.dest; hint.textContent = 'Token-aware address accepted.'; hint.className = 'hint ok'; showOnPlate(); }
    else { dest = undefined; hint.textContent = r.msg; hint.className = r.msg ? 'hint bad' : 'hint'; }
    refreshButton();
  });
  $('claimform').addEventListener('submit', (e) => { e.preventDefault(); doClaim(); });
  $('claim-next').addEventListener('click', async () => { if (claimer) await setClaimer(await assign((claimer.i + 1) % demoCount()), true); });
  $('double-btn').addEventListener('click', doDouble);
}
