import { describe, expect, it } from 'vitest';
import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { Contract, ledger, pureCircuits } from '../../managed/proofshield/contract/index.js';

const proverKeys = ZswapSecretKeys.fromSeed(new Uint8Array(32));
const saltA = new Uint8Array(32).fill(7);
const saltB = new Uint8Array(32).fill(8);
const ownerSecret = new Uint8Array(32).fill(9);

function newContract(reserve = 5n, secret = ownerSecret) {
  const contract = new Contract({});
  const initial = contract.initialState(createConstructorContext({}, proverKeys.coinPublicKey), reserve, secret);
  const context = createCircuitContext(
    dummyContractAddress(),
    proverKeys.coinPublicKey,
    initial.currentContractState.data,
    {},
  );
  return { contract, context };
}

describe('ProofShield sealed-bid auction circuits', () => {
  it('deploys directly into the commit phase with no bids', () => {
    const { contract } = newContract();
    const initial = contract.initialState(createConstructorContext({}, proverKeys.coinPublicKey), 5n, ownerSecret);
    const state = ledger(initial.currentContractState.data);

    expect(state.phase).toBe(1);
    expect(state.reserve_price).toBe(5n);
    expect(state.commitments.size()).toBe(0n);
    expect(state.revealed_bids.size()).toBe(0n);
  });

  it('rejects an invalid reserve during deployment', () => {
    const contract = new Contract({});
    expect(() => contract.initialState(createConstructorContext({}, proverKeys.coinPublicKey), 0n, ownerSecret)).toThrow();
  });

  it('accepts opaque bid commitments without recording bid amounts', () => {
    const { contract, context } = newContract();
    const commitment = pureCircuits.bid_commitment(42n, saltA);
    const committed = contract.circuits.commit_bid(context, commitment);
    const state = ledger(committed.context.currentQueryContext.state);

    expect(state.commitments.member(commitment)).toBe(true);
    expect(state.revealed_bids.size()).toBe(0n);
    expect(state.highest_bid).toBe(0n);
  });

  it('rejects duplicate commitments and commitments outside the commit phase', () => {
    const { contract, context } = newContract();
    const commitment = pureCircuits.bid_commitment(42n, saltA);
    const committed = contract.circuits.commit_bid(context, commitment);

    expect(() => contract.circuits.commit_bid(committed.context, commitment)).toThrow();
    const closed = contract.circuits.close_bidding(committed.context, ownerSecret);
    expect(() => contract.circuits.commit_bid(closed.context, pureCircuits.bid_commitment(10n, saltB))).toThrow();
    expect(() => contract.circuits.close_bidding(closed.context, ownerSecret)).toThrow();
    expect(() => contract.circuits.close_bidding(committed.context, saltB)).toThrow();
  });

  it('accepts a matching reveal and updates the public winner only after reveal', () => {
    const { contract, context } = newContract();
    const commitment = pureCircuits.bid_commitment(42n, saltA);
    const committed = contract.circuits.commit_bid(context, commitment);
    const closed = contract.circuits.close_bidding(committed.context, ownerSecret);

    expect(ledger(closed.context.currentQueryContext.state).highest_bid).toBe(0n);
    const revealed = contract.circuits.reveal_bid(closed.context, 42n, saltA);
    const state = ledger(revealed.context.currentQueryContext.state);
    expect(state.revealed_bids.lookup(commitment)).toBe(42n);
    expect(state.highest_bid).toBe(42n);
    expect(state.winning_commitment).toEqual(commitment);
    expect(state.reveal_count).toBe(1n);
  });

  it('rejects a bid or salt that does not match its commitment', () => {
    const { contract, context } = newContract();
    const commitment = pureCircuits.bid_commitment(42n, saltA);
    const committed = contract.circuits.commit_bid(context, commitment);
    const closed = contract.circuits.close_bidding(committed.context, ownerSecret);

    expect(() => contract.circuits.reveal_bid(closed.context, 41n, saltA)).toThrow();
    expect(() => contract.circuits.reveal_bid(closed.context, 42n, saltB)).toThrow();
  });

  it('rejects repeated reveal and only selects bids meeting reserve', () => {
    const { contract, context } = newContract(10n);
    const lowBid = pureCircuits.bid_commitment(7n, saltA);
    const highBid = pureCircuits.bid_commitment(15n, saltB);
    const lowCommitted = contract.circuits.commit_bid(context, lowBid);
    const highCommitted = contract.circuits.commit_bid(lowCommitted.context, highBid);
    const closed = contract.circuits.close_bidding(highCommitted.context, ownerSecret);
    const belowReserve = contract.circuits.reveal_bid(closed.context, 7n, saltA);

    expect(ledger(belowReserve.context.currentQueryContext.state).highest_bid).toBe(0n);
    const aboveReserve = contract.circuits.reveal_bid(belowReserve.context, 15n, saltB);
    expect(ledger(aboveReserve.context.currentQueryContext.state).highest_bid).toBe(15n);
    expect(() => contract.circuits.reveal_bid(aboveReserve.context, 15n, saltB)).toThrow();
    const finalized = contract.circuits.finalize_auction(aboveReserve.context, ownerSecret);
    expect(() => contract.circuits.finalize_auction(aboveReserve.context, saltB)).toThrow();
    expect(ledger(finalized.context.currentQueryContext.state).phase).toBe(3);
    expect(() => contract.circuits.reveal_bid(finalized.context, 7n, saltA)).toThrow();
  });
});
