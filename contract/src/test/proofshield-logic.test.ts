import { describe, expect, it } from 'vitest';
import { createCircuitContext, createConstructorContext, dummyContractAddress } from '@midnight-ntwrk/compact-runtime';
import { ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { Contract, ledger, pureCircuits } from '../../managed/proofshield/contract/index.js';

const proverKeys = ZswapSecretKeys.fromSeed(new Uint8Array(32));
const auctionId = new Uint8Array(32).fill(1);
const secondAuctionId = new Uint8Array(32).fill(2);
const saltA = new Uint8Array(32).fill(7);
const saltB = new Uint8Array(32).fill(8);
const ownerSecret = new Uint8Array(32).fill(9);
const wrongOwnerSecret = new Uint8Array(32).fill(10);

function newContract() {
  const contract = new Contract({});
  const initial = contract.initialState(createConstructorContext({}, proverKeys.coinPublicKey));
  const context = createCircuitContext(dummyContractAddress(), proverKeys.coinPublicKey, initial.currentContractState.data, {});
  return { contract, context };
}

function create(contract: any, context: any, id = auctionId, reserve = 5n, secret = ownerSecret) {
  return contract.circuits.create_auction(context, id, reserve, secret);
}

describe('ProofShield shared sealed-auction contract circuits', () => {
  it('creates multiple independent auctions in one contract state', () => {
    const { contract, context } = newContract();
    const first = create(contract, context);
    const second = create(contract, first.context, secondAuctionId, 12n, wrongOwnerSecret);
    const state = ledger(second.context.currentQueryContext.state);
    expect(state.phases.lookup(auctionId)).toBe(1);
    expect(state.phases.lookup(secondAuctionId)).toBe(1);
    expect(state.reserve_prices.lookup(auctionId)).toBe(5n);
    expect(state.commit_counts.lookup(auctionId)).toBe(0n);
    expect(state.reserve_prices.lookup(secondAuctionId)).toBe(12n);
  });

  it('rejects duplicate auction IDs and invalid reserve prices', () => {
    const { contract, context } = newContract();
    const created = create(contract, context);
    expect(() => create(contract, created.context)).toThrow();
    expect(() => create(contract, context, secondAuctionId, 0n)).toThrow();
  });

  it('keeps bid amounts hidden until reveal and scopes bids to their auction', () => {
    const { contract, context } = newContract();
    const created = create(contract, context);
    const commitment = pureCircuits.bid_commitment(42n, saltA);
    const committed = contract.circuits.commit_bid(created.context, auctionId, commitment);
    const state = ledger(committed.context.currentQueryContext.state);
    const key = pureCircuits.auction_bid_key(auctionId, commitment);
    expect(state.bid_commitments.member(key)).toBe(true);
    expect(state.commit_counts.lookup(auctionId)).toBe(1n);
    expect(state.revealed_bids.member(key)).toBe(false);
    expect(state.highest_bids.lookup(auctionId)).toBe(0n);
    expect(() => contract.circuits.close_bidding(committed.context, secondAuctionId, ownerSecret)).toThrow();
  });

  it('requires creator authorization and blocks duplicate commitments', () => {
    const { contract, context } = newContract();
    const created = create(contract, context);
    const commitment = pureCircuits.bid_commitment(42n, saltA);
    const committed = contract.circuits.commit_bid(created.context, auctionId, commitment);
    expect(() => contract.circuits.commit_bid(committed.context, auctionId, commitment)).toThrow();
    expect(() => contract.circuits.close_bidding(committed.context, auctionId, wrongOwnerSecret)).toThrow();
    const closed = contract.circuits.close_bidding(committed.context, auctionId, ownerSecret);
    expect(() => contract.circuits.commit_bid(closed.context, auctionId, pureCircuits.bid_commitment(3n, saltB))).toThrow();
  });

  it('reveals matching bids, respects reserve, and selects the highest qualifying bid', () => {
    const { contract, context } = newContract();
    const created = create(contract, context, auctionId, 10n);
    const low = pureCircuits.bid_commitment(7n, saltA);
    const high = pureCircuits.bid_commitment(15n, saltB);
    const one = contract.circuits.commit_bid(created.context, auctionId, low);
    const two = contract.circuits.commit_bid(one.context, auctionId, high);
    const closed = contract.circuits.close_bidding(two.context, auctionId, ownerSecret);
    expect(() => contract.circuits.reveal_bid(closed.context, auctionId, 8n, saltA)).toThrow();
    const revealedLow = contract.circuits.reveal_bid(closed.context, auctionId, 7n, saltA);
    expect(ledger(revealedLow.context.currentQueryContext.state).highest_bids.lookup(auctionId)).toBe(0n);
    const revealedHigh = contract.circuits.reveal_bid(revealedLow.context, auctionId, 15n, saltB);
    const state = ledger(revealedHigh.context.currentQueryContext.state);
    expect(state.highest_bids.lookup(auctionId)).toBe(15n);
    expect(state.winning_commitments.lookup(auctionId)).toEqual(high);
    expect(state.reveal_counts.lookup(auctionId)).toBe(2n);
    expect(() => contract.circuits.reveal_bid(revealedHigh.context, auctionId, 15n, saltB)).toThrow();
    const finalized = contract.circuits.finalize_auction(revealedHigh.context, auctionId, ownerSecret);
    expect(ledger(finalized.context.currentQueryContext.state).phases.lookup(auctionId)).toBe(3);
  });

  it('keeps phase transitions and winning data isolated between auctions', () => {
    const { contract, context } = newContract();
    const first = create(contract, context, auctionId, 5n, ownerSecret);
    const second = create(contract, first.context, secondAuctionId, 6n, wrongOwnerSecret);
    const commitment = pureCircuits.bid_commitment(9n, saltA);
    const committed = contract.circuits.commit_bid(second.context, auctionId, commitment);
    const closed = contract.circuits.close_bidding(committed.context, auctionId, ownerSecret);
    const revealed = contract.circuits.reveal_bid(closed.context, auctionId, 9n, saltA);
    const state = ledger(revealed.context.currentQueryContext.state);
    expect(state.phases.lookup(auctionId)).toBe(2);
    expect(state.phases.lookup(secondAuctionId)).toBe(1);
    expect(state.highest_bids.lookup(secondAuctionId)).toBe(0n);
  });
});
