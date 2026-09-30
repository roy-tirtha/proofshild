# ProofShield — Midnight Sealed-Bid Auction

![Midnight CI](https://github.com/roy-tirtha/proofshild/actions/workflows/ci.yml/badge.svg)

ProofShield is a sealed-bid auction dApp built with Midnight Compact. It uses one shared Multi-Auction contract on Midnight Preprod: creating an auction creates a new auction ID within that one contract; it never deploys a new contract per auction. Lace and 1AM wallet support is available from the navbar.

## Product Idea

ProofShield lets communities run sealed-bid auctions where bid values remain hidden while bidding is open, but the final winner is verifiable on-chain. Auction metadata is shared through MongoDB Atlas so participants can discover auctions, while Midnight enforces each auction lifecycle and verifies that every revealed bid matches the commitment submitted earlier.

## Architecture

| Layer | Responsibility |
| --- | --- |
| Midnight Preprod | One hardcoded contract address; auction IDs, phases, reserves, commitments, reveals, and winning bids |
| Browser + wallet | Wallet approvals; random bid salts; creator secret and unrevealed bid records encrypted in browser storage |
| MongoDB Atlas | Public auction catalogue, linked wallets, account records, and public transaction references |
| Vercel | Static frontend plus serverless API routes; no Render backend is needed |

contract-address.js is the single source of truth for the shared Preprod address. The address is hardcoded there, and the API imports the same value, so all users and all pages submit to the same contract.

## Privacy Model

### Public state

Observers can see the auction ID, phase, reserve, number of sealed commitments, number of revealed bids, and the highest qualifying revealed bid. The shared auction catalogue includes only title, creator wallet label, creation time, and public transaction references.

### Private witness and browser data

A bid amount and a random 32-byte salt create a domain-separated commitment hash. During the bidding phase Midnight receives only that opaque hash—not the amount or salt. When a bidder chooses to reveal, the contract verifies the pre-existing commitment and then intentionally publishes the amount. Creator authorization uses a secret whose commitment is on-chain, while the secret itself remains encrypted in that creator’s browser. MongoDB never receives bid amounts, salts, or creator secrets.

This is the observable privacy behavior: a sealed bid increments the public commitment count but reveals no amount; after the reveal transaction, that same verified amount can affect the public winner.

## Contract lifecycle

1. Deploy the shared contract once to Preprod.
2. Hardcode the emitted address in contract-address.js.
3. A signed-in creator connects Lace or 1AM and calls create_auction(auctionId, reserve, ownerSecret).
4. A bidder calls commit_bid(auctionId, commitment) using a locally generated amount/salt pair.
5. The creator calls close_bidding; bidders call reveal_bid; then the creator calls finalize_auction.

The Compact contract has five circuits: create_auction, commit_bid, close_bidding, reveal_bid, and finalize_auction. contract/managed/ contains their generated circuits and proving keys.

## Local setup

Requirements: Node.js 22+, Yarn 1.x, Compact CLI 0.23 compatible toolchain, a Lace or 1AM wallet configured for Preprod, and MongoDB Atlas for auth/catalogue features.

~~~bash
yarn install
yarn compile
yarn test
yarn build
yarn server
~~~

Open http://localhost:3000. For Vite hot reload, run yarn server and yarn dev in separate terminals, then use http://localhost:5173. Google OAuth needs both local origins/callbacks configured if you use both addresses.

## Deploy the one shared contract

This deploy happens once. It needs a funded developer Preprod wallet; regular auction creators and bidders never deploy contracts.

1. Copy .env.preprod.example to ignored .env.preprod.
2. Set exactly one of MIDNIGHT_PREPROD_MNEMONIC or MIDNIGHT_PREPROD_SEED. Never expose either secret in Git, Vercel, or the frontend.
3. Fund that wallet with Preprod NIGHT and registered DUST.
4. Run:

~~~bash
yarn deploy
~~~

5. Copy contractAddress from deployment.json and replace REPLACE_WITH_SINGLETON_PREPROD_ADDRESS in contract-address.js.
6. Run yarn build, deploy the repository to Vercel, and verify the address is visible on the auction pages.

The old per-auction deployment addresses are not compatible with this multi-auction contract. Deploy this version once and use only its emitted address.

## Vercel, Atlas, and OAuth

Vercel is serverless-ready: deploy the repository directly; do not deploy a separate Render backend. Set these server-only Vercel environment variables:

~~~text
MONGODB_URI
MONGODB_DB_NAME=proofshield
BETTER_AUTH_URL=https://proofshild.vercel.app
BETTER_AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
~~~

Do not place MongoDB or Google secrets in VITE_* variables. In Google Cloud, add:

- JavaScript origins: https://proofshild.vercel.app, http://localhost:3000, and optionally http://localhost:5173
- Redirect URIs: https://proofshild.vercel.app/api/auth/callback/google, http://localhost:3000/api/auth/callback/google, and optionally http://localhost:5173/api/auth/callback/google

## Validation and submission

~~~bash
yarn compile   # generates managed circuits and keys
yarn test      # six Compact circuit tests
yarn build     # Vercel production build
~~~

GitHub Actions runs compile, tests, and build on pushes and pull requests. The repository already exceeds the minimum 10 meaningful commits.

Still required from the organizer after the one-time deployment: commit the hardcoded contract address, push it, verify a green CI run, submit the product proposal for approval, and add screenshots plus the one-minute demo video.
