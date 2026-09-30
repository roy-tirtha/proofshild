import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  create_auction(context: __compactRuntime.CircuitContext<PS>,
                 auction_id_0: Uint8Array,
                 reserve_0: bigint,
                 owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  commit_bid(context: __compactRuntime.CircuitContext<PS>,
             auction_id_0: Uint8Array,
             commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  close_bidding(context: __compactRuntime.CircuitContext<PS>,
                auction_id_0: Uint8Array,
                owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reveal_bid(context: __compactRuntime.CircuitContext<PS>,
             auction_id_0: Uint8Array,
             amount_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize_auction(context: __compactRuntime.CircuitContext<PS>,
                   auction_id_0: Uint8Array,
                   owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  create_auction(context: __compactRuntime.CircuitContext<PS>,
                 auction_id_0: Uint8Array,
                 reserve_0: bigint,
                 owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  commit_bid(context: __compactRuntime.CircuitContext<PS>,
             auction_id_0: Uint8Array,
             commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  close_bidding(context: __compactRuntime.CircuitContext<PS>,
                auction_id_0: Uint8Array,
                owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reveal_bid(context: __compactRuntime.CircuitContext<PS>,
             auction_id_0: Uint8Array,
             amount_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize_auction(context: __compactRuntime.CircuitContext<PS>,
                   auction_id_0: Uint8Array,
                   owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  bid_commitment(amount_0: bigint, salt_0: Uint8Array): Uint8Array;
  owner_commitment(secret_0: Uint8Array): Uint8Array;
  auction_bid_key(auction_id_0: Uint8Array, commitment_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  bid_commitment(context: __compactRuntime.CircuitContext<PS>,
                 amount_0: bigint,
                 salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  owner_commitment(context: __compactRuntime.CircuitContext<PS>,
                   secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  auction_bid_key(context: __compactRuntime.CircuitContext<PS>,
                  auction_id_0: Uint8Array,
                  commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  create_auction(context: __compactRuntime.CircuitContext<PS>,
                 auction_id_0: Uint8Array,
                 reserve_0: bigint,
                 owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  commit_bid(context: __compactRuntime.CircuitContext<PS>,
             auction_id_0: Uint8Array,
             commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  close_bidding(context: __compactRuntime.CircuitContext<PS>,
                auction_id_0: Uint8Array,
                owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reveal_bid(context: __compactRuntime.CircuitContext<PS>,
             auction_id_0: Uint8Array,
             amount_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize_auction(context: __compactRuntime.CircuitContext<PS>,
                   auction_id_0: Uint8Array,
                   owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  phases: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): number;
    [Symbol.iterator](): Iterator<[Uint8Array, number]>
  };
  reserve_prices: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  auction_owner_commitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  bid_commitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  revealed_bids: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  highest_bids: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  winning_commitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  commit_counts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  reveal_counts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
