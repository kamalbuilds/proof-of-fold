import { describe, expect, it } from 'vitest';
import { compileString } from '../direct-compile.js';
import { Contract, SignatureTemplate } from '../../src/index.js';
import { StatefulContract } from '../../src/stateful/index.js';
import MockNetworkProvider from '../../src/network/MockNetworkProvider.js';
import { alicePkh, alicePriv, alicePub } from '../fixture/vars.js';
import type { Utxo } from '../../src/interfaces.js';
import p2pkhArtifact from '../fixture/p2pkh.artifact.js';

// `setSequence` only puts a number on the master input. The chain still enforces `this.age` exactly as written, so a
// sequence below the required age, or of the other lock type, is refused by the VM, and a larger one holds the spend
// until the master is that old.
const SRC = `pragma solidcash >=0.8.0;
contract Matured() {
  int counter;
  function tick() {
    require(this.age >= 3);
    this.counter = this.counter + 1;
  }
}`;

const outcome = (send: Promise<unknown>): Promise<string> => send.then(
  () => 'accepted',
  (error: unknown) => String((error as Error)?.message ?? error),
);

async function deployMatured(): Promise<{ provider: MockNetworkProvider; contract: StatefulContract<any> }> {
  const provider = new MockNetworkProvider();
  const p2pkh = new Contract(p2pkhArtifact, [alicePkh], { provider });
  const fundingUtxo: Utxo = { txid: 'a7'.repeat(32), vout: 0, satoshis: 200_000n };
  await provider.addUtxo(p2pkh.address, fundingUtxo);
  const { contract } = await StatefulContract.deploy(compileString(SRC), [], {
    provider,
    fundingUtxo,
    funder: p2pkh.unlock.spend(alicePub, new SignatureTemplate(alicePriv)),
    initialState: { counter: 0n },
    changeAddress: p2pkh.address,
    initialBalance: 50_000n,
  });
  return { provider, contract };
}

const counter = async (contract: StatefulContract<any>): Promise<bigint | undefined> => (
  (await contract.getState()) as { counter?: bigint }
).counter;

describe('stateful this.age: the VM still enforces the lock', () => {
  it('refuses a sequence below the required age, however old the master is', async () => {
    const { provider, contract } = await deployMatured();
    await provider.mine(10);

    for (const sequence of [0, 1, 2]) {
      expect(await outcome(contract.call.tick().setSequence(sequence).send()))
        .toMatch(new RegExp(`OP_CHECKSEQUENCEVERIFY.*Sequence number: ${sequence}; required sequence number: 3`));
    }
    expect(await counter(contract)).toBe(0n);

    expect(await outcome(contract.call.tick().setSequence(3).send())).toBe('accepted');
    expect(await counter(contract)).toBe(1n);
  });

  it('refuses a time-based sequence against a block-count require', async () => {
    const { provider, contract } = await deployMatured();
    await provider.mine(10);

    const timeBased = (1 << 22) | 3;
    expect(await outcome(contract.call.tick().setSequence(timeBased).send())).toMatch(/incompatible sequence type flag/);
    expect(await counter(contract)).toBe(0n);
  });

  it('a larger sequence holds the spend until the master is that old, and the last setSequence wins', async () => {
    const { provider, contract } = await deployMatured();

    expect(await outcome(contract.call.tick().setSequence(6).send())).toMatch(/non-BIP68-final/);
    let mined = 0;
    while (await outcome(contract.call.tick().setSequence(6).send()) !== 'accepted') {
      await provider.mine(1);
      mined++;
      expect(mined).toBeLessThan(10);
    }
    expect(mined).toBeGreaterThanOrEqual(5);
    expect(await counter(contract)).toBe(1n);

    // The master was just respent, so it is young again; the first value would pass later, the last one is what applies.
    expect(await outcome(contract.call.tick().setSequence(1).setSequence(3).send())).toMatch(/non-BIP68-final/);
    expect(await counter(contract)).toBe(1n);
  });
});
