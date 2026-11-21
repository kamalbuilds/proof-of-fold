import { demoKey, addressOf } from '../../src/keys.ts';
console.log(addressOf(demoKey(process.argv[2] as any, Number(process.argv[3])), process.argv[2] as any));
