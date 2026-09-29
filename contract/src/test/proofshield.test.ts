import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  type EnvironmentConfiguration,
  waitForFunds,
} from '@midnight-ntwrk/testkit-js';
import pino from 'pino';

import { getConfig } from '../config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from '../wallet.js';
import { buildProviders, type ProofShieldProviders } from '../providers.js';
import {
  CompiledProofShieldContract,
  Contract,
  ledger,
  zkConfigPath,
} from '../../index.js';

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error WebSocket global assignment for apollo
globalThis.WebSocket = WebSocket;

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// The Alice test wallet seed (deterministic local devnet seed)
const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'AlicePrivateProofShieldState';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

function resolveSecret(net: string): WalletSecret {
  if (net === 'local') return { kind: 'seed', value: ALICE_LOCAL_SEED };

  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(
      `Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`,
    );
  }
  if (mnemonic) {
    return { kind: 'mnemonic', value: mnemonic };
  }
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(
        `${seedEnv} must be a hex string of even length (no 0x prefix).`,
      );
    }
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(
    `Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'. ` +
      `Set one in .env.${net} or the shell.`,
  );
}

describe(`ProofShield Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: ProofShieldProviders;
  let contractAddress: ContractAddress;

  const config = getConfig();
  const secret = resolveSecret(network);
  const isRemote = network !== 'local';
  const syncTimeoutMs = Number(
    process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ??
      (isRemote ? 60 * 60_000 : 10 * 60_000),
  );

  // Helper: read current public ledger state from the chain
  async function queryLedger(p: ProofShieldProviders) {
    const state = await p.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);

    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
    await wallet.start();
    await syncWallet(logger, wallet.wallet, syncTimeoutMs);

    const nightBalance = await waitForFunds(
      wallet.wallet,
      envConfig,
      false,
      wallet.unshieldedKeystore,
    );
    logger.info(`Wallet NIGHT balance on '${network}': ${nightBalance}`);

    providers = buildProviders(wallet, zkConfigPath, config);
    logger.info(`Providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  // ----------------------------------------------------------------
  // Test 1: Deploy the contract
  // Verifies that the ProofShield contract can be deployed and
  // that the initial public ledger state is correct (no claim yet).
  // ----------------------------------------------------------------
  it('Deploys the ProofShield contract with no claim verified', async () => {
    logger.info('Deploying ProofShield contract...');

    const deployed: DeployedContract<Contract> =
      await (deployContract<Contract>)(providers, {
        compiledContract: CompiledProofShieldContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });

    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Contract deployed at: ${contractAddress}`);

    expect(contractAddress).toBeDefined();
    expect(contractAddress.length).toBeGreaterThan(0);

    // Initial state: claim_verified should be false, threshold 0
    const state = await queryLedger(providers);
    expect(state.claim_verified).toBe(false);
    expect(state.threshold).toBe(0n);
  });

  // ----------------------------------------------------------------
  // Test 2: Initialise the claim threshold
  // Sets the public threshold to 10 activities.
  // This threshold is PUBLIC — a verifier can read it.
  // ----------------------------------------------------------------
  it('Initialises a claim threshold of 10 activities', async () => {
    const THRESHOLD = 10n;

    await (submitCallTx<Contract, 'initialise_claim'>)(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'initialise_claim',
      args: [THRESHOLD],
    });

    const state = await queryLedger(providers);
    // The threshold is now visible publicly — verifiers know the bar
    expect(state.threshold).toBe(THRESHOLD);
    // But no proof has been submitted yet
    expect(state.claim_verified).toBe(false);
    logger.info(`Threshold set to ${state.threshold}. Claim not yet proven.`);
  });

  // ----------------------------------------------------------------
  // Test 3: Submit a proof that PASSES (count >= threshold)
  // The activity_count is a PRIVATE WITNESS — it is used inside the
  // ZK circuit but never written to the public ledger.
  // Only the boolean outcome (claim_verified = true) is public.
  // ----------------------------------------------------------------
  it('Proves the claim passes when activity_count >= threshold (privacy: count stays private)', async () => {
    // PRIVATE: the prover has 15 verified activities (≥ threshold of 10)
    // This value is NOT written to the chain. Only the boolean passes.
    const PRIVATE_ACTIVITY_COUNT = 15n;

    await (submitCallTx<Contract, 'submit_proof'>)(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'submit_proof',
      args: [PRIVATE_ACTIVITY_COUNT],
    });

    const state = await queryLedger(providers);
    // PUBLIC: the verifier only sees this boolean — not the 15
    expect(state.claim_verified).toBe(true);
    // The raw count is NEVER on-chain. We verify it's not accessible:
    expect((state as any).activity_count).toBeUndefined();
    logger.info(`Claim verified: ${state.claim_verified} | Threshold: ${state.threshold} | Raw count: PRIVATE`);
  });

  // ----------------------------------------------------------------
  // Test 4: Submit a proof that FAILS (count < threshold)
  // Demonstrates that an insufficient count produces claim_verified = false.
  // ----------------------------------------------------------------
  it('Proves the claim fails when activity_count < threshold', async () => {
    // PRIVATE: the prover only has 5 activities (< threshold of 10)
    const PRIVATE_ACTIVITY_COUNT = 5n;

    await (submitCallTx<Contract, 'submit_proof'>)(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'submit_proof',
      args: [PRIVATE_ACTIVITY_COUNT],
    });

    const state = await queryLedger(providers);
    expect(state.claim_verified).toBe(false);
    logger.info(`Claim verified: ${state.claim_verified} | Threshold: ${state.threshold} | Raw count: PRIVATE`);
  });
});
