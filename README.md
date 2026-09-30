# ProofShield Sealed Auction

![Midnight CI](https://github.com/roy-tirtha/proofshild/actions/workflows/ci.yml/badge.svg)

ProofShield is a commit–reveal sealed-bid auction prototype built with Midnight Compact. Lace and 1AM connect from the navbar; the auction page reads and changes the configured Preprod contract directly. Bids are hidden during commitment and become public when opened. This prototype does not transfer or escrow NIGHT or any other asset.

## Product Idea

ProofShield lets a community create and run independent sealed-bid auctions on Midnight. A creator deploys a fresh contract, starts its bidding phase, and publishes only its title, creator wallet label, and contract address to a shared MongoDB catalogue; every visitor can see the auction and verify its live state from Preprod. A bidder submits a wallet-approved commitment transaction without publishing the amount. After the creator closes bidding, bidders reveal saved amounts and the contract verifies each commitment before publishing the amount and updating the result. Auction creation, bidding, and reveal/finalization are separate flows; no bids, salts, or creator secrets enter the catalogue. Atlas also stores each signed-in participant's finalized auction action and public transaction reference, so their Profile can show the app activity without recording private bid data.

## Auction Lifecycle

1. Sign in, connect a Lace or 1AM wallet, and use **Auctions** to deploy a fresh contract, set its public reserve, and register it in the shared catalogue.
2. A bidder enters an amount. The browser generates a 32-byte random salt and computes its commitment, then submits only the commitment to the contract.
3. The creator closes bidding. The creator’s authorization secret is encrypted in that wallet’s local browser storage.
4. Each bidder presses “Reveal my bids.” The circuit verifies locally saved bid/salt pairs against on-chain commitments; valid amounts become public and the ledger updates the leading bid.
5. The creator finalizes the result. No files or manual uploads are part of the normal flow.

The **Auctions** page combines auction creation with the current shared catalogue. The separate **Place bid** page lets users select an open auction, while **Declare winner** lets them select an auction to close, reveal, or finalize. Each auction has its own contract because the Compact contract maintains one auction lifecycle per deployed instance. The creator secret is generated and stored encrypted in that creator's browser; creator-only close/finalize actions cannot be recovered from the catalogue or another device.

Bid amounts, salts, and creator authorization data stay in browser storage scoped to the connected wallet and contract. They are not uploaded to ProofShield or MongoDB. The app creates a random local key for Midnight’s private-state provider; there is no password prompt. The same browser and wallet are required to access unrevealed bids and creator actions; clearing browser storage or changing devices permanently loses those secrets. A committed bid without its local secret cannot be revealed.

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

The bid amount and random salt are inputs to the commit/reveal circuits. During the commit phase, the contract stores only `persistentHash(domain, amount, salt)`. At reveal, the amount is intentionally disclosed and recorded so all observers can verify the auction result. The creator secret authorizes closing/finalization; its hash is public, but the secret is never written to the ledger. Private state and bid/creator records are held in browser local storage under a generated device key. This client-side storage is not a backup service and is not synchronized between devices.

This design hides bid values **until they are revealed**; it does not keep bids private forever. Commitments and their on-chain timing remain public. The contract proves that a revealed bid matches a previous commitment and updates the highest qualifying amount. It does not prove a bidder's real-world identity or that a bid amount represents available funds. There is no escrow, payment, refund, anti-Sybil identity, deadline, or automatic settlement. Do not use this prototype for an asset-bearing auction without adding and auditing those features.

No private-state password is requested from bidders. The app creates a random local key for Midnight’s local private-state provider. Back up access to the same browser profile and do not clear its site data while you have unrevealed bids or creator privileges.

## Requirements

- Node.js 22+, Yarn 1.x, Compact CLI compatible with language version `0.23`, and Docker Desktop for local Midnight integration tests.
- `yarn install` installs JavaScript dependencies. `yarn compile` generates five circuits, keys, and TypeScript bindings under `contract/managed/proofshield/`.
- `yarn test` runs the generated-circuit logic suite (7 tests). `yarn build` creates the static site in `dist/`.
- Run `yarn build` before `yarn server`; port `3000` then serves the bundled frontend and local auth/API together at `http://localhost:3000`, which is the canonical local Google OAuth origin. For hot reload, run `yarn server` and `yarn dev` in separate terminals and open `http://localhost:5173`; use `localhost`, not `127.0.0.1`, so auth cookies remain on the same hostname. The auction catalogue is public, but creating, bidding, or recording winner actions requires sign-in so each finalized action can be saved to Atlas. Wallet transactions require Lace or 1AM on Preprod. MongoDB Atlas is required for sign-in and the shared catalogue.
- Local network integration testing needs `docker compose up -d --wait node indexer proof-server`, then `yarn test:local`.

## Deploy a Real Preprod Contract

The wallet navbar exposes a wallet-backed deployment helper on every page, so you can deploy without `yarn deploy`. It still requires your connected Preprod wallet to approve the deploy transaction and pay its fees. Do not put a wallet seed/mnemonic into the browser console, GitHub, Vercel, or chat.

1. Fund your Lace or 1AM Preprod wallet with NIGHT and registered DUST.
2. Open `https://proofshild.vercel.app/auction.html` (or local `http://localhost:3000/auction.html`) and connect the wallet. The helper is available from any page with the wallet navbar.
3. Open browser developer tools → Console and run `await window.proofshieldDeployAuction()`, then approve the deployment in your wallet. Deployment uses an isolated temporary private-state key; it does not ask for or store a reusable password.
4. The authentic address is returned in the console and displayed on the page. The helper saves it in this browser. If deploying a new instance, update the frontend default or set `VITE_CONTRACT_ADDRESS` before rebuilding so all visitors target that instance.
5. The current address is included as the frontend default, so publish the updated frontend build to make it available to visitors. `VITE_CONTRACT_ADDRESS` can still override it at build time. Alternatively, the terminal helper can deploy another instance: copy `.env.preprod.example` to `.env.preprod`, set exactly one of `MIDNIGHT_PREPROD_MNEMONIC` or `MIDNIGHT_PREPROD_SEED` locally, fund it, then run `yarn deploy`; the address is saved to ignored `deployment.json`.

The current Preprod contract address is `7dce7dd497e7cfdd82a2176f04678106c13db9e9d05315590f58af383daf4eca`. It is the default address in the auction frontend; deployments are deliberately not part of the Vercel build because they require a funded owner wallet. The address is public and verifiable on Preprod.

## Vercel and Authentication

Vercel builds the frontend and hosts the `api/` serverless functions; a separate Render service is not required for the deployed site. Configure `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` as server-only Vercel variables. Set `BETTER_AUTH_URL=https://proofshild.vercel.app`; never put DB/OAuth secrets in `VITE_*` variables. Google OAuth authorized JavaScript origins should include `https://proofshild.vercel.app` and `http://localhost:3000` (optionally `http://localhost:5173` for Vite). Authorized redirect URIs must include `https://proofshild.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. Locally, open the app as `http://localhost:3000` so it matches the local auth origin; don't use `127.0.0.1` for the OAuth session. Profile and linked wallet data are separate from private auction data.

## CI and Submission Status

GitHub Actions runs Compact compile, Vite build, and the 7 circuit logic tests on pushes and pull requests. The repository history currently exceeds the ten-commit requirement. Confirm the latest workflow run is green after pushing changes.

Still requires owner/organizer actions: submit the product proposal for approval; capture successful compile and deployed-address screenshots; record the one-minute wallet-to-commit/reveal demo video; and verify a passing GitHub Actions run after publishing the latest changes. The contract is deployed and its address is configured as the frontend default.
