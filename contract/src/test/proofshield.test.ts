import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract, submitCallTx, type DeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type EnvironmentConfiguration, waitForFunds } from '@midnight-ntwrk/testkit-js';
import pino from 'pino';
import { getConfig } from '../config.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from '../wallet.js';
import { buildProviders, type ProofShieldProviders } from '../providers.js';
import { CompiledProofShieldContract, Contract, ledger, pureCircuits, zkConfigPath } from '../../index.js';

// Required for GraphQL subscriptions in Node.js.
// @ts-expect-error WebSocket global assignment for Apollo.
globalThis.WebSocket = WebSocket;

const LOCAL_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'AlicePrivateProofShieldAuctionState';
const OWNER_SECRET = new Uint8Array(32).fill(9);
const BID_SALT = new Uint8Array(32).fill(7);
const BID_AMOUNT = 12n;
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

function resolveSecret(net: string): WalletSecret {
  if (net === 'local') return { kind: 'seed', value: LOCAL_SEED };
  const mnemonic = process.env[`MIDNIGHT_${net.toUpperCase()}_MNEMONIC`]?.trim().replace(/\s+/g, ' ');
  const seed = process.env[`MIDNIGHT_${net.toUpperCase()}_SEED`]?.trim();
  if (Boolean(mnemonic) === Boolean(seed)) throw new Error(`Set exactly one MIDNIGHT_${net.toUpperCase()}_MNEMONIC or _SEED.`);
  return mnemonic ? { kind: 'mnemonic', value: mnemonic } : { kind: 'seed', value: seed! };
}

describe(`ProofShield sealed auction (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: ProofShieldProviders;
  let contractAddress: ContractAddress;
  const config = getConfig();
  const secret = resolveSecret(network);

  async function queryLedger() {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);
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
    wallet = await MidnightWalletProvider.build(logger, env, secret);
    await wallet.start();
    await syncWallet(logger, wallet.wallet, Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 3_600_000));
    await waitForFunds(wallet.wallet, env, false, wallet.unshieldedKeystore);
    providers = buildProviders(wallet, zkConfigPath, config);
  });

  afterAll(async () => {
    if (wallet) await wallet.stop();
  });

  it('deploys, commits privately, reveals, and finalizes the auction', async () => {
    const deployed: DeployedContract<Contract> = await deployContract<Contract>(providers, {
      compiledContract: CompiledProofShieldContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
      args: [5n, OWNER_SECRET],
    });
    contractAddress = deployed.deployTxData.public.contractAddress;
    expect((await queryLedger()).phase).toBe(1);
    const commitment = pureCircuits.bid_commitment(BID_AMOUNT, BID_SALT);
    await submitCallTx<Contract, 'commit_bid'>(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'commit_bid',
      args: [commitment],
    });
    expect((await queryLedger()).revealed_bids.size()).toBe(0n);

    await submitCallTx<Contract, 'close_bidding'>(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'close_bidding',
      args: [OWNER_SECRET],
    });
    await submitCallTx<Contract, 'reveal_bid'>(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'reveal_bid',
      args: [BID_AMOUNT, BID_SALT],
    });
    expect((await queryLedger()).highest_bid).toBe(BID_AMOUNT);
    await submitCallTx<Contract, 'finalize_auction'>(providers, {
      compiledContract: CompiledProofShieldContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'finalize_auction',
      args: [OWNER_SECRET],
    });
    expect((await queryLedger()).phase).toBe(3);
  });
});
