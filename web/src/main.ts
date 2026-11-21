import { fetchJson, openContext, readSnap, $, type Net, type Ctx } from './chain.ts';
import { initPlate } from './plate.ts';
import { initClaim, onSnap as claimSnap } from './claim.ts';
import { initLookup, selectDefault } from './lookup.ts';
import { initWatcher } from './watcher.ts';
import { initCost, addPageClaim } from './cost.ts';
import { loadLines, renderState, renderAddresses, renderAuthority, renderFooter } from './sections.ts';

const REFRESH_MS = 30_000;

async function main() {
  const { networks } = await fetchJson<{ networks: { id: Net; epochs: number[] }[] }>('./data/networks.json');
  const want = new URLSearchParams(location.search).get('net');
  const pick = networks.find((n) => n.id === want) ?? networks.find((n) => n.id === 'mainnet') ?? networks[0];
  if (networks.length > 1) {
    const sel = $('netselect') as HTMLSelectElement;
    sel.innerHTML = networks.map((n) => `<option value="${n.id}" ${n.id === pick.id ? 'selected' : ''}>${n.id}</option>`).join('');
    sel.addEventListener('change', () => { location.search = `?net=${sel.value}`; });
    $('netpick').hidden = false;
  }
  initPlate();
  await loadLines();
  const c: Ctx = await openContext(pick.id, pick.epochs);
  renderAddresses(c);
  renderAuthority(c);
  await renderFooter(c);

  let inflight: Promise<void> | undefined;
  const refresh = () => (inflight ??= (async () => {
    try {
      const s = await readSnap(c);
      renderState(c, s);
      await claimSnap();
    } catch (e: any) {
      $('live').className = 'live bad';
      $('live-text').textContent = 'reconnecting';
      console.error(e);
    } finally { inflight = undefined; }
  })());
  initClaim(c, refresh, (txid) => { addPageClaim(txid).catch(console.error); });
  await refresh();
  if (!c.snap) throw new Error('could not read the chain');
  await Promise.all([initLookup(c), initCost(c)]);
  initWatcher(c);
  selectDefault();
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

main().catch((e) => {
  console.error(e);
  $('live').className = 'live bad';
  $('live-text').textContent = 'could not start';
});
