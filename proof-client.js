import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CostModel, Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { Contract, ledger, pureCircuits } from './contract/managed/proofshield/contract/index.js';
import { requireContractAddress } from './contract-address.js';

const networkId = 'preprod';
const artifactBase = `${window.location.origin}/contract/managed/proofshield`;
const privateStateId = 'ProofShieldAuctionBrowserState';
const privateStateDatabase = 'proofshield-sealed-auction-v1';
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

export function createAuctionId() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function auctionIdToHex(auctionId) {
  return toHex(auctionId);
}

export function auctionIdFromHex(auctionId) {
  if (!/^[0-9a-f]{64}$/i.test(auctionId || '')) throw new Error('Auction ID is malformed.');
  return fromHex(auctionId);
}

export function sharedContractAddress() {
  return requireContractAddress();
}

const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function waitForWalletTransactions(api, onWaiting = () => {}) {
  if (typeof api.getTxHistory !== 'function') return;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const history = await api.getTxHistory(0, 20);
    const pending = history.filter(({ txStatus }) => txStatus.status === 'pending' || txStatus.status === 'confirmed');
    if (pending.length === 0) return;
    onWaiting(pending.length);
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error('A wallet transaction is still pending after three minutes. Wait for it to confirm or expire, then retry; do not submit another transaction yet.');
}

function isWalletPendingError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /transaction is already pending|wait for it to confirm or expire/i.test(message);
}

export async function getAuctionPrivateStatePassword(api) {
  const addresses = await api.getShieldedAddresses();
  const key = `proofshield:midnight-key:${addresses.shieldedAddress}`;
  let password = localStorage.getItem(key);
  if (!password) {
    const entropy = crypto.getRandomValues(new Uint8Array(32));
    password = `A${Array.from(entropy, (byte) => byte.toString(16).padStart(2, '0')).join('')}a!9`;
    localStorage.setItem(key, password);
  }
  return password;
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
  if (typeof api.hintUsage === 'function') {
    await api.hintUsage(['getProvingProvider', 'balanceUnsealedTransaction', 'submitTransaction']);
  }

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
        midnightDbName: privateStateDatabase,
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

export function auctionFromLedger(state, auctionId) {
  const id = typeof auctionId === 'string' ? auctionIdFromHex(auctionId) : auctionId;
  if (!state.phases.member(id)) throw new Error('This auction is not present in the shared contract.');
  const winnerExists = state.winning_commitments.member(id);
  return {
    auctionId: auctionIdToHex(id),
    phase: state.phases.lookup(id),
    reserve: state.reserve_prices.lookup(id),
    sealedCount: state.commit_counts.lookup(id),
    revealedCount: state.reveal_counts.lookup(id),
    highestBid: state.highest_bids.lookup(id),
    hasWinner: winnerExists,
    winningCommitment: winnerExists ? state.winning_commitments.lookup(id) : undefined,
  };
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

export async function readPreprodAuction(auctionId) {
  const state = await readPreprodAuctionState(sharedContractAddress());
  return auctionFromLedger(state, auctionId);
}

export async function submitAuctionCircuit(providers, contractAddress, circuitId, args = [], walletApi, onWaiting = () => {}) {
  const submit = async () => {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const privateState = await providers.privateStateProvider.get(privateStateId);
    if (privateState === null) await providers.privateStateProvider.set(privateStateId, {});
    const result = await submitCallTx(providers, {
      compiledContract,
      contractAddress,
      privateStateId,
      circuitId,
      args,
    });
    return result.public;
  };

  try {
    return await submit();
  } catch (error) {
    if (!walletApi || !isWalletPendingError(error)) throw error;
    onWaiting('The wallet is finalizing an earlier transaction. Waiting before retrying this action…');
    await waitForWalletTransactions(walletApi, (count) => onWaiting(`Waiting for ${count} wallet transaction${count === 1 ? '' : 's'} to finalize…`));
    await delay(8_000);
    onWaiting('Retrying the approved auction action in this wallet window…');
    return submit();
  }
}

export function transactionReference(result) {
  const reference = result?.txHash ?? result?.txId ?? result?.identifiers?.[0];
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error('Midnight finalized the transaction without a usable transaction identifier.');
  }
  return reference;
}

export async function recordAuctionActivity({ contractAddress, auctionId, action, transactionId, walletAddress }) {
  const response = await fetch('/api/auction-events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contractAddress, auctionId, action, transactionId, walletAddress }),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Auction activity API returned an unexpected response (HTTP ${response.status}).`);
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Auction activity could not be saved.');
  return body.event;
}

export function bytesToHex(bytes) {
  return toHex(bytes);
}

export function hexToBytes(hex) {
  return fromHex(hex);
}
