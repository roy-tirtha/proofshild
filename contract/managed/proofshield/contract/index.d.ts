import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  initialise_claim(context: __compactRuntime.CircuitContext<PS>,
                   required_count_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submit_proof(context: __compactRuntime.CircuitContext<PS>,
               activity_count_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  initialise_claim(context: __compactRuntime.CircuitContext<PS>,
                   required_count_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submit_proof(context: __compactRuntime.CircuitContext<PS>,
               activity_count_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  initialise_claim(context: __compactRuntime.CircuitContext<PS>,
                   required_count_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  submit_proof(context: __compactRuntime.CircuitContext<PS>,
               activity_count_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly claim_verified: boolean;
  readonly claim_initialized: boolean;
  readonly threshold: bigint;
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
