import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CostModel, Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { Contract, ledger, pureCircuits } from './contract/managed/proofshield/contract/index.js';

const networkId = 'preprod';
const artifactBase = `${window.location.origin}/contract/managed/proofshield`;
const privateStateId = 'ProofShieldAuctionBrowserState';
const compiledContract = CompiledContract.make('ProofShieldAuction', Contract)
  .pipe(CompiledContract.withVacantWitnesses);

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const value = hex.replace(/^0x/, '');
  if (!value || value.length % 2 !== 0 || /[^\da-f]/i.test(value)) {
    throw new Error('Wallet returned a malformed transaction.');
  }
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

export function createBidCommitment(amount, salt) {
  return pureCircuits.bid_commitment(BigInt(amount), salt);
}

export async function createAuctionSession(api, storagePassword) {
  if (typeof storagePassword !== 'string' || storagePassword.length < 16) {
    throw new Error('Enter a private-state password of at least 16 characters.');
  }
  const [config, addresses] = await Promise.all([api.getConfiguration(), api.getShieldedAddresses()]);
  if (config.networkId !== networkId) {
    throw new Error(`Wallet is connected to ${config.networkId}, but this contract targets Preprod.`);
  }
  if (!config.indexerUri || !config.indexerWsUri) {
    throw new Error('The connected wallet did not provide Preprod indexer endpoints.');
  }
  setNetworkId(config.networkId);

  const zkConfigProvider = new FetchZkConfigProvider(artifactBase, window.fetch.bind(window));
  const publicDataProvider = indexerPublicDataProvider(config.indexerUri, config.indexerWsUri, window.WebSocket);
  const walletProvider = {
    getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
    async balanceTx(tx) {
      const balanced = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced.tx));
    },
  };
  const midnightProvider = {
    async submitTx(tx) {
      const [txId] = tx.identifiers();
      if (!txId) throw new Error('The transaction has no trackable identifier.');
      await api.submitTransaction(toHex(tx.serialize()));
      return txId;
    },
  };

  return {
    providers: {
      privateStateProvider: levelPrivateStateProvider({
        privateStoragePasswordProvider: () => storagePassword,
        accountId: addresses.shieldedAddress,
      }),
      publicDataProvider,
      zkConfigProvider,
      proofProvider: await dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel()),
      walletProvider,
      midnightProvider,
    },
    dispose: async () => {},
  };
}

export async function readAuctionState(providers, contractAddress) {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) throw new Error('No auction contract was found at that address on Preprod.');
  return ledger(state.data);
}

export async function readPreprodAuctionState(contractAddress) {
  const provider = indexerPublicDataProvider(
    'https://indexer.preprod.midnight.network/api/v4/graphql',
    'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    window.WebSocket,
  );
  const state = await provider.queryContractState(contractAddress);
  if (!state) throw new Error('No auction contract was found at that address on Preprod.');
  return ledger(state.data);
}

export async function submitAuctionCircuit(providers, contractAddress, circuitId, args = []) {
  const result = await submitCallTx(providers, {
    compiledContract,
    contractAddress,
    privateStateId,
    circuitId,
    args,
  });
  return result.public;
}

export async function deployAuctionFromConnectedWallet(api) {
  const passwordEntropy = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const temporaryPassword = `A${passwordEntropy}a!9`;
  const deploymentPrivateStateId = `ProofShieldAuctionDeployment-${crypto.randomUUID()}`;
  const session = await createAuctionSession(api, temporaryPassword);
  try {
    const deployed = await deployContract(session.providers, {
      compiledContract,
      privateStateId: deploymentPrivateStateId,
      initialPrivateState: {},
    });
    return deployed.deployTxData.public.contractAddress;
  } finally {
    await session.dispose().catch(() => {});
  }
}

export function bytesToHex(bytes) {
  return toHex(bytes);
}

export function hexToBytes(hex) {
  return fromHex(hex);
}
