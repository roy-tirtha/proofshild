import dotenv from 'dotenv';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledProofShieldContract, Contract } from './index.js';
import { getConfig } from './src/config.js';
import { buildProviders } from './src/providers.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from './src/wallet.js';

const network = process.env.MIDNIGHT_NETWORK ?? 'preprod';
const envFile = path.resolve(`.env.${network}`);
dotenv.config({ path: envFile });
process.env.MIDNIGHT_NETWORK = network;
if (network === 'local') {
  throw new Error('Choose preview or preprod; local deployments use the integration test suite.');
}
const prefix = `MIDNIGHT_${network.toUpperCase()}`;
const mnemonic = process.env[`${prefix}_MNEMONIC`]?.trim().replace(/\s+/g, ' ');
const seed = process.env[`${prefix}_SEED`]?.trim();
if (Boolean(mnemonic) === Boolean(seed)) {
  throw new Error(
    `Preprod deployment wallet is missing or ambiguous.\n` +
      `1. Copy .env.${network}.example to .env.${network}.\n` +
      `2. Set exactly one of ${prefix}_MNEMONIC or ${prefix}_SEED in that local file.\n` +
      `3. Fund the wallet with Preprod NIGHT and registered DUST, then run yarn deploy again.\n` +
      `Never paste the mnemonic or seed into the frontend, chat, or GitHub.`,
  );
}
const secret: WalletSecret = mnemonic
  ? { kind: 'mnemonic', value: mnemonic }
  : { kind: 'seed', value: seed! };

const config = getConfig();
const env: EnvironmentConfiguration = {
  walletNetworkId: config.networkId,
  networkId: config.networkId,
  indexer: config.indexer,
  indexerWS: config.indexerWS,
  node: config.node,
  nodeWS: config.nodeWS,
  faucet: config.faucet,
  proofServer: config.proofServer,
};
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const wallet = await MidnightWalletProvider.build(logger, env, secret);

try {
  setNetworkId(config.networkId);
  await wallet.start();
  await syncWallet(logger, wallet.wallet, Number(process.env.MIDNIGHT_SYNC_TIMEOUT_MS ?? 3_600_000));
  const providers = buildProviders(wallet, path.resolve('contract/managed/proofshield'), config);
  const deployed = await deployContract<Contract>(providers, {
    compiledContract: CompiledProofShieldContract,
    privateStateId: `ProofShield-${network}`,
    initialPrivateState: {},
  });
  const address = deployed.deployTxData.public.contractAddress;
  const result = { network, contractAddress: address, phase: 'UNINITIALIZED', deployedAt: new Date().toISOString() };
  await writeFile('deployment.json', `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  logger.info({ ...result, file: 'deployment.json' }, 'Sealed-auction contract deployed');
} finally {
  await wallet.stop();
}
