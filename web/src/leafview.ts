// Shared by claim and lookup: put one leaf of an epoch file on the proof plate.
import { hexToBytes, type Entry } from '../../src/merkle.ts';
import type { EpochFile } from '../../src/pool-client.ts';
import { isZeroRoot, NETS, fmtTokens, type Ctx } from './chain.ts';
import { select } from './plate.ts';

export const entryOf = (ef: EpochFile, index: number): Entry => {
  const e = ef.entries[index];
  return { method: e.method, identity: hexToBytes(e.identity), cumulative: BigInt(e.cumulative) };
};
export const siblingsOf = (ef: EpochFile, index: number): Uint8Array[] => {
  const p = hexToBytes(ef.entries[index].proof);
  return Array.from({ length: p.length / 32 }, (_, i) => p.slice(i * 32, i * 32 + 32));
};

export function selectLeaf(c: Ctx, ef: EpochFile, index: number, title: string) {
  const s = c.snap;
  const refs = [{ label: `epoch-${ef.epoch}.json`, root: ef.root }];
  if (s) {
    if (s.poolEpoch === ef.epoch && !isZeroRoot(s.poolRoot)) refs.push({ label: 'pool root', root: s.poolRoot });
    if (s.activeEpoch === ef.epoch && !isZeroRoot(s.activeRoot)) refs.push({ label: 'registry active', root: s.activeRoot });
    if (s.status === 1 && s.pendingEpoch === ef.epoch) refs.push({ label: 'registry pending', root: s.pendingRoot });
  }
  const e = entryOf(ef, index);
  select({ title: `${title} \u00b7 leaf ${index} \u00b7 ${fmtTokens(e.cumulative)} ${NETS[c.net].symbol}`, entry: e, index, siblings: siblingsOf(ef, index), refs });
}
