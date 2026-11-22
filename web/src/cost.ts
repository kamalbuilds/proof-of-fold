// Cost: sizes and fees read from chain for every transaction in txs.jsonl, compared with a push model.
import { $, NETS, dataUrl, esc, fmtInt, txLink, type Ctx } from './chain.ts';
import { txStats, type TxStats } from './txstats.ts';

type Logged = { what: string; txid: string; demo?: number; destination?: string };
type Row = Logged & { s: TxStats };
const PUSH_FIXED = 148, PUSH_PER_OUTPUT = 34;          // bytes: one input and one P2PKH payment, the stated minimum
const PUSH_TX = PUSH_FIXED + PUSH_PER_OUTPUT;
const FEE_FLOOR = 1;                                  // sat per byte, the relay minimum
const rows: Row[] = [];
let ctx: Ctx;

const names: Record<string, string> = {
  'deploy-registry': 'Deploy RootRegistry', 'deploy-pool': 'Deploy Proof of FoldPool', 'fund-pool': 'Fund the pool with tokens', 'propose-root': 'Propose a root (2 of 3 signatures)',
  'activate-root': 'Activate the root', 'sync-root': 'Sync the pool', 'claim-demo': 'Claim (demo leaf)', 'claim-demo-again': 'Claim (demo leaf)', 'claim-page': 'Claim made from this page', 'fund-burners': 'Fund the demo keys with fee sats', 'mint-token': 'Mint the reward token', send: 'Plain send', 'open-push': 'Open the push window', push: 'Operator push',
};
const label = (r: Logged) => (names[r.what] ?? r.what) + (r.demo !== undefined ? ` #${r.demo}` : '');

async function pool<T, R>(items: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]); } }));
  return out;
}

function render() {
  const sym = NETS[ctx.net].symbol;
  $('cost-rows').querySelector('tbody')!.innerHTML = rows.map((r) => `<tr><td>${esc(label(r))}</td><td>${txLink(ctx, r.txid)}</td><td class="num">${fmtInt(r.s.bytes)}</td><td class="num">${fmtInt(r.s.fee)}</td></tr>`).join('');
  const by = (w: string) => rows.filter((r) => r.what === w);
  const claims = rows.filter((r) => r.what === 'claim-demo' || r.what === 'claim-page');
  const operator = ['propose-root', 'activate-root', 'sync-root'].map((w) => ({ w, r: by(w).slice(-1)[0] })).filter((x) => x.r);
  const opBytes = operator.reduce((n, x) => n + x.r.s.bytes, 0);
  const opSrc = operator.map((x) => `${names[x.w]} ${txLink(ctx, x.r.txid, x.r.s.bytes + ' B')}`).join(' + ');
  const claimBytes = claims.length ? Math.round(claims.reduce((n, r) => n + r.s.bytes, 0) / claims.length) : undefined;
  const claimSrc = claims.length ? claims.map((r) => txLink(ctx, r.txid, r.s.bytes + ' B')).join(', ') : '';
  const be = opBytes ? Math.ceil(opBytes / PUSH_TX) : undefined;
  const f = (n: number) => fmtInt(n);
  const col = (n: number) => ({
    push: n * PUSH_TX,
    pull: opBytes,
    users: claimBytes === undefined ? undefined : n * claimBytes,
  });
  const a = col(56), b = col(10000);
  $('cost-model').innerHTML = `
    <div class="model">
      <div>
        <h3>Push model</h3>
        <p>The operator sends each folder its own transaction every epoch. Minimum size per payment:</p>
        <p class="formula">${PUSH_FIXED} + ${PUSH_PER_OUTPUT} = ${PUSH_TX} bytes per user per epoch</p>
        <p>Source: the stated P2PKH minimum, ${PUSH_FIXED} bytes for the input and fixed fields plus ${PUSH_PER_OUTPUT} bytes per output. Cost at the ${FEE_FLOOR} sat/B relay floor.</p>
      </div>
      <div>
        <h3>Pull model</h3>
        <p>The operator pays for one root per epoch, however many folders there are. Each folder pays for their own claim.</p>
        <p class="formula">operator bytes per epoch = ${opBytes ? f(opBytes) : 'propose + activate + sync'}</p>
        <p>Source: ${opSrc || 'measured once the transactions are on chain'}.${claimBytes === undefined ? ' The claim size fills in after the first claim lands.' : ` Claim size ${f(claimBytes)} B, measured: ${claimSrc}.`}</p>
      </div>
    </div>
    <p class="breakeven">${be ? `Break-even at <strong>${f(be)} users</strong> <span class="mono">= ceil(${f(opBytes)} / ${PUSH_TX})</span>. Past that, every extra folder costs the operator nothing.` : 'Break-even = operator bytes per epoch / ' + PUSH_TX + ' bytes per push payment.'}</p>
    <table class="totals"><thead><tr><th></th><th>56 real folders</th><th>10,000 folders</th></tr></thead><tbody>
      <tr><td>Push, operator bytes per epoch</td><td>${f(a.push)}</td><td>${f(b.push)}</td></tr>
      <tr><td>Push, operator fee per epoch</td><td>${f(a.push * FEE_FLOOR)} sats</td><td>${f(b.push * FEE_FLOOR)} sats</td></tr>
      <tr><td>Pull, operator bytes per epoch</td><td>${opBytes ? f(a.pull) : 'n/a'}</td><td>${opBytes ? f(b.pull) : 'n/a'}</td></tr>
      <tr><td>Pull, operator fee per epoch</td><td>${opBytes ? f(a.pull * FEE_FLOOR) + ' sats' : 'n/a'}</td><td>${opBytes ? f(b.pull * FEE_FLOOR) + ' sats' : 'n/a'}</td></tr>
      <tr><td>Pull, folders' own claim bytes (all claim once)</td><td>${a.users === undefined ? 'after the first claim' : f(a.users)}</td><td>${b.users === undefined ? 'after the first claim' : f(b.users)}</td></tr>
      <tr class="src-row"><td colspan="3">Push = users x ${PUSH_TX}. Pull operator = measured transactions above. Folders' bytes = users x ${claimBytes === undefined ? 'measured claim size' : f(claimBytes) + ' (measured claim size)'}. Fee = bytes x ${FEE_FLOOR} sat/B.</td></tr>
    </tbody></table>`;
  void sym;
}

/** A claim made from this page joins the table the moment its transaction is read back. */
export async function addPageClaim(txid: string) {
  if (rows.some((r) => r.txid === txid)) return;
  rows.push({ what: 'claim-page', txid, s: await txStats(ctx.provider, txid) });
  render();
}

export async function initCost(c: Ctx) {
  ctx = c;
  const text = await (await fetch(dataUrl(c.net, 'txs.jsonl'))).text();
  const logged: Logged[] = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const stats = await pool(logged, 3, (l) => txStats(c.provider, l.txid));
  logged.forEach((l, i) => rows.push({ ...l, s: stats[i] }));
  render();
}
