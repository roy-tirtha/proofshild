import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  commit_bid(context: __compactRuntime.CircuitContext<PS>,
             commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  close_bidding(context: __compactRuntime.CircuitContext<PS>,
                owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reveal_bid(context: __compactRuntime.CircuitContext<PS>,
             amount_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize_auction(context: __compactRuntime.CircuitContext<PS>,
                   owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  commit_bid(context: __compactRuntime.CircuitContext<PS>,
             commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  close_bidding(context: __compactRuntime.CircuitContext<PS>,
                owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reveal_bid(context: __compactRuntime.CircuitContext<PS>,
             amount_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize_auction(context: __compactRuntime.CircuitContext<PS>,
                   owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  bid_commitment(amount_0: bigint, salt_0: Uint8Array): Uint8Array;
  owner_commitment(secret_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  bid_commitment(context: __compactRuntime.CircuitContext<PS>,
                 amount_0: bigint,
                 salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  owner_commitment(context: __compactRuntime.CircuitContext<PS>,
                   secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  commit_bid(context: __compactRuntime.CircuitContext<PS>,
             commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  close_bidding(context: __compactRuntime.CircuitContext<PS>,
                owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reveal_bid(context: __compactRuntime.CircuitContext<PS>,
             amount_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalize_auction(context: __compactRuntime.CircuitContext<PS>,
                   owner_secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly phase: number;
  readonly reserve_price: bigint;
  readonly auction_owner_commitment: Uint8Array;
  commitments: {
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
  readonly highest_bid: bigint;
  readonly winning_commitment: Uint8Array;
  readonly reveal_count: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               reserve_0: bigint,
               owner_secret_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
