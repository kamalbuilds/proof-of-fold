import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';

export const hash160 = (b: Uint8Array): Uint8Array => ripemd160(sha256(b));
/** OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG */
export const p2pkhLock = (pkh: Uint8Array): Uint8Array => concatBytes(Uint8Array.of(0x76, 0xa9, 0x14), pkh, Uint8Array.of(0x88, 0xac));
