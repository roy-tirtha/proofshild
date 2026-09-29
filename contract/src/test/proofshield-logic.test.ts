import { describe, expect, it } from 'vitest';
import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { Contract, ledger } from '../../managed/proofshield/contract/index.js';

const proverKeys = ZswapSecretKeys.fromSeed(new Uint8Array(32));

function newContract() {
  const contract = new Contract({});
  const initial = contract.initialState(createConstructorContext({}, proverKeys.coinPublicKey));
  const context = createCircuitContext(
    dummyContractAddress(),
    proverKeys.coinPublicKey,
    initial.currentContractState.data,
    {},
  );
  return { contract, context };
}

describe('ProofShield Compact circuit logic', () => {
  it('starts with no public claim and a zero threshold', () => {
    const { contract, context } = newContract();
    const initial = contract.initialState(createConstructorContext({}, proverKeys.coinPublicKey));

    expect(ledger(initial.currentContractState.data)).toEqual({
      claim_verified: false,
      claim_initialized: false,
      threshold: 0n,
    });
    expect(context.currentQueryContext).toBeDefined();
  });

  it('discloses the configured threshold in public ledger state', () => {
    const { contract, context } = newContract();
    const result = contract.circuits.initialise_claim(context, 10n);

    expect(ledger(result.context.currentQueryContext.state)).toEqual({
      claim_verified: false,
      claim_initialized: true,
      threshold: 10n,
    });
  });

  it('marks a claim verified when the private count meets the threshold', () => {
    const { contract, context } = newContract();
    const initialized = contract.circuits.initialise_claim(context, 10n);
    const result = contract.circuits.submit_proof(initialized.context, 15n);

    expect(ledger(result.context.currentQueryContext.state)).toEqual({
      claim_verified: true,
      claim_initialized: true,
      threshold: 10n,
    });
  });

  it('leaves the claim unverified when the private count is below the threshold', () => {
    const { contract, context } = newContract();
    const initialized = contract.circuits.initialise_claim(context, 10n);
    const result = contract.circuits.submit_proof(initialized.context, 5n);

    expect(ledger(result.context.currentQueryContext.state)).toEqual({
      claim_verified: false,
      claim_initialized: true,
      threshold: 10n,
    });
  });

  it('rejects attempts to reset an initialized public threshold', () => {
    const { contract, context } = newContract();
    const initialized = contract.circuits.initialise_claim(context, 10n);

    expect(() => contract.circuits.initialise_claim(initialized.context, 2n)).toThrow();
  });

  it('rejects a proof before the public threshold is initialized', () => {
    const { contract, context } = newContract();

    expect(() => contract.circuits.submit_proof(context, 15n)).toThrow();
  });

  it('rejects a zero public threshold', () => {
    const { contract, context } = newContract();

    expect(() => contract.circuits.initialise_claim(context, 0n)).toThrow();
  });
});
