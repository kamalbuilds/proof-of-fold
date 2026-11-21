import { generatePrivateKey, privateKeyToP2pkhCashAddress, secp256k1, binToHex, hexToBin, cashAddressToLockingBytecode, lockingBytecodeToCashAddress, CashAddressType } from '@bitauth/libauth';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';

export type Net = 'chipnet' | 'mainnet';
export const prefixOf = (net: Net) => (net === 'mainnet' ? 'bitcoincash' : 'bchtest');

export const newPrivateKey = (): Uint8Array => generatePrivateKey(() => randomBytes(32));
export const publicKey = (priv: Uint8Array): Uint8Array => secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
export const addressOf = (priv: Uint8Array, net: Net): string => {
  const a = privateKeyToP2pkhCashAddress({ privateKey: priv, prefix: prefixOf(net), tokenSupport: false } as any);
  if (typeof a === 'string') throw new Error(a);
  return (a as any).address ?? a;
};
/** Token-aware (z...) form of a locking bytecode, for wallets that must not strand CashTokens. */
export const tokenAddress = (lockingBytecode: Uint8Array, net: Net): string => {
  const r = lockingBytecodeToCashAddress({ bytecode: lockingBytecode, prefix: prefixOf(net), tokenSupport: true } as any);
  if (typeof r === 'string') throw new Error(r);
  return (r as any).address ?? r;
};
export const lockingBytecodeOfAddress = (address: string): Uint8Array => {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === 'string') throw new Error(r);
  return r.bytecode;
};
export { CashAddressType };

/** Demo keys are published on the page on purpose: they only hold demo leaves. Derived, not random, so anyone can check. */
export const demoKey = (net: Net, i: number): Uint8Array => sha256(new TextEncoder().encode(`foldclaim-demo-claimer/${net}/${i}`));
export { binToHex, hexToBin };
