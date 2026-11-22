// Static-from-deployment sections: the state strip, addresses, authority and footer.
import type { Deployment } from '../../src/pool-client.ts';
import { $, NETS, lockEta, SPONSOR_API, addrLink, blocksToActivate, esc, fmtInt, fmtTokens, fetchJson, loadEpoch, isZeroRoot, shortHex, txLink, type Ctx, type Snap } from './chain.ts';

type Lines = Record<string, string | number>;
let lines: Lines = {};
export const loadLines = async () => { lines = await fetchJson<Lines>('./data/contract-lines.json'); };

const root = (h: string) => (isZeroRoot(h) ? '<span class="aux">none yet</span>' : `<span class="hexlink mono" title="${h}">${shortHex(h, 16, 8)}</span>`);
const chip = (cls: string, t: string) => `<span class="chip ${cls}">${t}</span>`;
const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 5 ? 'just now' : `${s}s ago`; };

export function renderState(c: Ctx, s: Snap) {
  const n = NETS[c.net];
  const b = blocksToActivate(s, c.d.rootDelay);
  const pending = s.status === 1;
  let window: string;
  if (!pending) window = `${chip('idle', 'no proposal')} <span class="aux">a proposal waits ${c.d.rootDelay} blocks before it can activate</span>`;
  else if (!b.confirmed) window = `${chip('warn', 'waiting')} <span>the proposal confirms first, then ${c.d.rootDelay} blocks</span>`;
  else if (b.left > 0) window = `${chip('warn', `${b.left} blocks`)} <span>of ${c.d.rootDelay} remain before epoch ${s.pendingEpoch} can activate${lockEta(c, b.left)}</span>`;
  else window = `${chip('ok', 'open')} <span>epoch ${s.pendingEpoch} can activate now, anyone may call activateRoot</span>`;
  const sync = s.poolEpoch === 0 && s.activeEpoch === 0 ? chip('idle', 'no root yet') : s.poolEpoch === s.activeEpoch ? chip('ok', 'in sync') : chip('warn', 'behind the registry');
  $('sheet').innerHTML = `
    <dt>Network</dt><dd>${n.label} <span class="aux">reward token ${n.symbol}</span></dd>
    <dt>Block height</dt><dd>${fmtInt(s.tip)} <span class="aux">read ${ago(s.at)} over Electrum</span></dd>
    <dt>Registry</dt><dd>${pending ? chip('warn', 'pending') : chip('idle', 'idle')} <span class="aux">highest epoch proposed ${s.highEpoch}</span></dd>
    <dt>Active epoch</dt><dd>${s.activeEpoch} ${root(s.activeRoot)}</dd>
    <dt>Pending epoch</dt><dd>${pending ? s.pendingEpoch : '<span class="aux">none</span>'} ${pending ? root(s.pendingRoot) : ''}</dd>
    <dt>Audit window</dt><dd>${window}</dd>
    <dt>Pool epoch</dt><dd>${s.poolEpoch} ${sync} ${isZeroRoot(s.poolRoot) ? '' : root(s.poolRoot)}</dd>
    <dt>Pool balance</dt><dd>${fmtTokens(s.poolTokens)} <span class="unit">${n.symbol}</span> <span class="aux">${s.poolTokens} base units, 8 decimals</span></dd>`;
  const live = $('live');
  live.className = 'live ok';
  $('live-text').textContent = `${n.label} \u00b7 block ${fmtInt(s.tip)}`;
}

export function renderAddresses(c: Ctx) {
  const d = c.d;
  $('addresses').innerHTML = `
    <dt>Registry</dt><dd>${addrLink(c, d.registry.address)}</dd>
    <dt>Registry deploy</dt><dd>${txLink(c, d.registry.deployTxid, d.registry.deployTxid)}</dd>
    <dt>Pool</dt><dd>${addrLink(c, d.pool.address)}</dd>
    <dt>Pool deploy</dt><dd>${txLink(c, d.pool.deployTxid, d.pool.deployTxid)}</dd>
    ${d.pool.fundTxid ? `<dt>Pool funding</dt><dd>${txLink(c, d.pool.fundTxid, d.pool.fundTxid)}</dd>` : ''}`;
}

const ref = (k: string) => `<span class="line">${esc(String(lines[k]))}</span>`;
export function renderAuthority(c: Ctx) {
  const d: Deployment = c.d;
  const keys = [...d.operators.map((k, i) => [`Operator ${i + 1}`, k]), ['Guardian', d.guardian], ['Pusher', d.pusher]] as [string, string][];
  $('authority-out').innerHTML = `<div class="auth">
    <div><h3 class="sub">Keys fixed in the contract address</h3><ul class="keys">
      ${keys.map(([k, v]) => `<li><span class="k">${k}</span><span class="v">${v}</span></li>`).join('')}
      <li><span class="k">rootDelay</span><span class="v">${d.rootDelay} blocks</span></li>
      <li><span class="k">pushDelay</span><span class="v">${d.pushDelay} blocks</span></li></ul></div>
    <div><h3 class="sub">What the contracts enforce</h3><ul class="rules">
      <li><span class="what">Two of the three operator keys propose a root. Their signatures are checked with OP_CHECKMULTISIG.</span>${ref('twoOfThree')}${ref('proposeRoot')}</li>
      <li><span class="what">The guardian key can cancel a pending root and can never propose one.</span>${ref('onlyGuardian')}${ref('cancelPending')}</li>
      <li><span class="what">A pending root activates once the registry UTXO is ${d.rootDelay} blocks old. Anyone may call activateRoot.</span>${ref('rootDelay')}</li>
      <li><span class="what">The pool copies only the active root. Anyone may sync it.</span>${ref('syncRoot')}</li>
      <li><span class="what">The operator may push only after the active root has been idle for ${d.pushDelay} blocks.</span>${ref('pushDelay')}${ref('pushWindow')}</li>
      <li><span class="what">The operator may push only payouts of at least ${lines.minPushUnits} base units.</span>${ref('minPush')}</li>
      <li><span class="what">A push pays only the leaf's own identity, never an address the operator chooses.</span>${ref('pushDestination')}</li>
      <li><span class="what">A claim pays cumulative minus already paid. A second claim of the same total reverts with NothingToClaim.</span>${ref('nothingToClaim')}</li>
    </ul></div></div>`;
}

export async function renderFooter(c: Ctx) {
  const ef = await loadEpoch(c, c.epochs[c.epochs.length - 1]);
  $('foot').innerHTML = `
    <div><h3>Contracts</h3><ul><li>contracts/RootRegistry.scash</li><li>contracts/FoldClaimPool.scash</li></ul>
      <h3 style="margin-top:16px">Tests</h3><ul><li>test/registry.test.ts</li><li>test/pool.test.ts</li><li>test/merkle.test.ts</li><li>test/snapshot.test.ts</li><li>test/depth.test.ts</li></ul></div>
    <div><h3>Sponsor API</h3><ul><li><a href="${SPONSOR_API}" target="_blank" rel="noopener">${SPONSOR_API}</a></li><li>pinned: ${esc(ef.url)}</li></ul>
      <h3 style="margin-top:16px">Token category (${NETS[c.net].symbol})</h3><ul><li>${c.d.tokenCategory}</li></ul>
      <h3 style="margin-top:16px">Registry and pool categories</h3><ul><li>${c.d.registry.categoryId}</li><li>${c.d.pool.categoryId}</li></ul></div>`;
}
