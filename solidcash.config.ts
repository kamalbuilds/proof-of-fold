import { defineConfig } from '@solidcash/solidhat/config';

// Tests run on a mock network that enforces the BCH input, stack, transaction and commitment limits and the
// relay dust rules, so a green run means the transactions fit on mainnet.
export default defineConfig({
  paths: { contracts: 'contracts', artifacts: 'artifacts', tests: 'test' },
  compiler: {},
  accounts: { count: 4, satoshis: 100_000_000n },
  networks: {
    mock: { type: 'mock' },
    strict: {
      type: 'mock',
      consensus: {
        maximumInputBytes: 10_000,
        maximumStackItemBytes: 10_000,
        maximumTransactionBytes: 100_000,
        maximumNftCommitmentBytes: 128,
      },
      policy: { enforceDust: true },
    },
    chipnet: { type: 'electrum', network: 'chipnet', mnemonic: process.env.SOLIDCASH_MNEMONIC_CHIPNET },
    mainnet: { type: 'electrum', network: 'mainnet', mnemonic: process.env.SOLIDCASH_MNEMONIC_MAINNET },
  },
  defaultNetwork: 'strict',
});
