# ProofShield Sealed Auction

![Midnight CI](https://github.com/roy-tirtha/proofshild/actions/workflows/ci.yml/badge.svg)

ProofShield is a commit–reveal sealed-bid auction prototype built with Midnight Compact. Lace and 1AM connect from the navbar; the auction page reads and changes the configured Preprod contract directly. Bids are hidden during commitment and become public when opened. This prototype does not transfer or escrow NIGHT or any other asset.

## Product Idea

ProofShield lets communities run sealed-bid auctions for digital opportunities without exposing bids during the bidding phase. Each bidder commits to a bid and a random secret salt; after the auction creator closes bidding, bidders reveal receipts and Midnight verifies each opening before updating the public leading bid. This reduces early bid-copying, while keeping the rules and eventual outcome verifiable on-chain.

## Auction Lifecycle

1. The first connected wallet starts the one-time auction with a public reserve and receives a private creator receipt.
2. Bidders enter a bid. Their browser generates a cryptographically random 32-byte salt and computes a Compact commitment. The contract stores only that commitment; the bid and salt are downloaded as a private receipt.
3. The creator uploads their receipt to close the commit phase. No new bids are accepted afterwards.
4. Bidders upload their own bid receipts to reveal. The circuit recomputes and verifies each commitment. Revealed bids and the current highest eligible bid become public.
5. The creator uploads the creator receipt to finalize the auction.

Receipts are essential secrets. Back them up privately. Anyone who gets a bid receipt can reveal that bid; anyone who gets the creator receipt can close/finalize the auction. Losing the creator receipt makes those creator-only actions unavailable. The frontend does not upload receipts or bid data to the API.

## Privacy Model

### Public on-chain state

| State | What observers learn |
|---|---|
| Auction phase and public reserve | Whether the auction is accepting commitments, reveals, or is finalized; the reserve amount |
| Bid commitment map | Number and values of opaque commitment hashes, but not committed amounts or salts |
| Revealed bid map and reveal count | Each amount that has been opened and how many bids have been revealed |
| Highest bid and winning commitment | Highest revealed bid meeting the reserve and its opaque commitment |
| Creator commitment | A hash proving creator authorization, not the creator secret |

### Private circuit inputs

The bid amount and random salt are inputs to the commit/reveal circuits. During the commit phase, the contract stores only `persistentHash(domain, amount, salt)`. At reveal, the amount is intentionally disclosed and recorded so all observers can verify the auction result. The creator secret is used to authorize closing/finalization; its hash is public, but the secret is never written to the ledger. Private receipts are stored locally as downloaded JSON files, not uploaded to ProofShield or MongoDB.

This design hides bid values **until they are revealed**; it does not keep bids private forever. Commitments and their on-chain timing remain public. The contract proves that a revealed bid matches a previous commitment and updates the highest qualifying amount. It does not prove a bidder's real-world identity or that a bid amount represents available funds. There is no escrow, payment, refund, anti-Sybil identity, deadline, or automatic settlement. Do not use this prototype for an asset-bearing auction without adding and auditing those features.

The password in the UI encrypts Midnight's local private state. It does not encrypt the downloaded receipt; protect the receipt as you would a secret key.

## Requirements

- Node.js 22+, Yarn 1.x, Compact CLI compatible with language version `0.23`, and Docker Desktop for local Midnight integration tests.
- `yarn install` installs JavaScript dependencies. `yarn compile` generates five circuits, keys, and TypeScript bindings under `contract/managed/proofshield/`.
- `yarn test` runs the generated-circuit logic suite (7 tests). `yarn build` creates the static site in `dist/`.
- `yarn dev` starts the Vite frontend at `http://127.0.0.1:5173`. Start `yarn server` in a second terminal for local auth and Mongo-backed account APIs. The auction can be browsed publicly; wallet transactions require Lace or 1AM on Preprod.
- Local network integration testing needs `docker compose up -d --wait node indexer proof-server`, then `yarn test:local`.

## Deploy a Real Preprod Contract

The deployment helper creates a new authentic on-chain auction contract. It cannot run until the repository owner supplies and funds a deployment wallet; do not put wallet secrets into GitHub, Vercel, the browser, or chat.

1. Ensure the Compact CLI is installed: `compact --version`. The workflow pins toolchain `0.31.1` (Compact language `0.23`).
2. Run `cp .env.preprod.example .env.preprod` and locally set exactly one of `MIDNIGHT_PREPROD_MNEMONIC` or `MIDNIGHT_PREPROD_SEED` in `.env.preprod`.
3. Fund that wallet for Preprod and register/fund DUST using the network's official faucet.
4. Run `yarn deploy`. It compiles, deploys, prints the resulting address, and writes `deployment.json` (ignored by Git).
5. In Vercel → Project → Settings → Environment Variables, set `VITE_CONTRACT_ADDRESS` to the address from `deployment.json`, then redeploy. This is one-time owner configuration; users never deploy or paste addresses.

No authentic contract address is committed yet. Deployment is deliberately not part of the Vercel build because deployment requires a funded owner wallet. The address shown by the app is public and verifiable on Preprod.

## Vercel and Authentication

Vercel builds the frontend and hosts the `api/` serverless functions; a separate Render service is not required for the deployed site. Configure `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` as server-only Vercel variables. Set `BETTER_AUTH_URL=https://proofshild.vercel.app`; never put DB/OAuth secrets in `VITE_*` variables. Google OAuth redirect URI: `https://proofshild.vercel.app/api/auth/callback/google` (and the matching localhost callback for local auth). The app account/profile and linked wallet features are separate from auction receipts.

## CI and Submission Status

GitHub Actions runs Compact compile, Vite build, and the 7 circuit logic tests on pushes and pull requests. The repository history currently exceeds the ten-commit requirement. A passing CI run is needed after changes are pushed.

Still requires owner/organizer actions: deploy the funded Preprod contract and set the Vercel address; submit this proposal for idea approval; capture successful compile and deployed-address screenshots; record the one-minute wallet-to-commit/reveal demo video; and verify a passing GitHub Actions run. These cannot be truthfully completed from this workspace without the deployment wallet, organizer approval, and a live wallet session.
