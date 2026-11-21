// SolidCash 0.50 funds every stateful transaction at exactly 1 sat/byte (StatefulTransactionBuilder.computeMinFee) and has
// no option to pay more. At 1 sat/byte a transaction can sit behind a backlog of other 1 sat/byte transactions (chipnet
// carries a standing backlog), so the live scripts and the web page raise the rate here. Upstream patch: upstream/.
import { StatefulTransactionBuilder } from '@solidcash/solidcash/stateful';

let rate = 1;
const proto = StatefulTransactionBuilder.prototype as any;
if (!proto.__foldclaimFeeRate) {
  proto.computeMinFee = function computeMinFee(size: bigint): bigint { return BigInt(rate) * size; };
  proto.__foldclaimFeeRate = true;
}
export const setFeeRate = (satsPerByte: number): void => {
  if (!Number.isInteger(satsPerByte) || satsPerByte < 1 || satsPerByte > 50) throw new RangeError('fee rate must be 1..50 sat/byte');
  rate = satsPerByte;
};
export const feeRate = (): number => rate;
