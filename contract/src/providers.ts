import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type MidnightWalletProvider } from './wallet.js';
import { type NetworkConfig } from './config.js';

export type ProofShieldCircuits = 'start_auction' | 'commit_bid' | 'close_bidding' | 'reveal_bid' | 'finalize_auction';

export type ProofShieldProviders = MidnightProviders<any>;

export function buildProviders(
  wallet: MidnightWalletProvider,
  zkConfigPath: string,
  config: NetworkConfig,
): ProofShieldProviders {
  const zkConfigProvider = new NodeZkConfigProvider<ProofShieldCircuits>(zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `proofshield-${Date.now()}`,
      privateStoragePasswordProvider: () => 'ProofShield-Test-Password',
      accountId: wallet.getCoinPublicKey(),
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      config.proofServer,
      zkConfigProvider,
    ),
    walletProvider: wallet,
    midnightProvider: wallet,
  };
}
