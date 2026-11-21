// A stateful function that checks `require(this.age >= N)` runs OP_CHECKSEQUENCEVERIFY on the contract's master
// input, so that input must carry nSequence >= N. SolidCash 0.50 builds stateful inputs with the default sequence and
// has no call option to change it. `withRelativeLock` sets the sequence of one contract's master input for the
// duration of one send; the VM, preflight and the node still enforce the lock exactly as written. Upstream patch:
// upstream/this-age-sequence.
import { TransactionBuilder } from '@solidcash/solidcash';

type Override = { categoryId: string; sequence: number };
const active: Override[] = [];
const proto = TransactionBuilder.prototype as any;

if (!proto.__foldclaimRelativeLock) {
  const original = proto.buildLibauthTransaction;
  proto.buildLibauthTransaction = function patched(this: any, ...args: unknown[]) {
    if (active.length > 0) {
      for (const input of this.inputs ?? []) {
        const token = input.token;
        if (token?.nft?.capability !== 'minting') continue;
        const hit = active.find((o) => o.categoryId.toLowerCase() === String(token.category).toLowerCase());
        if (hit) input.options = { ...(input.options ?? {}), sequence: hit.sequence };
      }
    }
    return original.apply(this, args);
  };
  proto.__foldclaimRelativeLock = true;
}

/** Run `send` with the master input of the contract in category `categoryId` carrying a block-based lock of `blocks`. */
export async function withRelativeLock<T>(categoryId: string, blocks: number, send: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > 0xffff) throw new RangeError('blocks must be 1..65535');
  const entry = { categoryId, sequence: blocks };
  active.push(entry);
  try { return await send(); } finally { active.splice(active.indexOf(entry), 1); }
}
