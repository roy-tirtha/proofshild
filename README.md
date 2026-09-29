# ProofShield

![Midnight CI](https://github.com/roy-tirtha/proofshild/actions/workflows/ci.yml/badge.svg)

> **Privacy-first technical achievement verification on the Midnight network.**

ProofShield is a Level 1 prototype of a privacy-preserving system that allows
individuals to prove specific technical claims — without exposing their full
personal history, raw credentials, or complete activity records.

---

## Initial Product Idea

ProofShield lets technical candidates prove a narrow qualification, such as meeting a security activity threshold, without sharing their raw activity count, repository history, or identity details. Trusted evidence adapters can validate source data off-chain, while a Midnight Compact circuit proves the qualification and reveals only the public threshold and pass/fail result.

---

## Level 1 — New Moon (Current Scope)

This repository contains the ProofShield landing page, sign-in/registration,
authenticated profile, Compact contract artifacts, and MongoDB-backed APIs.
The profile reads account and linked-wallet data from the app APIs, and can
request recent transactions directly from a connected Lace or 1AM wallet.
Contract proving/submission is not currently wired into the browser.

**What Level 1 includes:**
- Compact source with two circuits and generated proving/verifying artifacts
- Local Midnight integration tests for deploy, threshold initialization, and passing/failing proofs
- A helper to deploy to Preview or Preprod and save the returned address
- Lace and 1AM DApp Connector wallet connection from the navigation bar
- MongoDB Atlas persistence for email/Google accounts and linked wallet addresses
- Authenticated, privacy-minimized proof transaction record API
- GitHub Actions workflow for compilation, frontend build, and generated-circuit logic tests

---

## Privacy Model

This is the most important section to understand.

### Public State (on-chain `ledger`)

The following values are stored publicly on the Midnight blockchain and readable
by anyone — including a verifier or recruiter:

| Field | Type | Meaning |
|---|---|---|
| `threshold` | `Uint<64>` | The minimum activity count required to pass |
| `claim_verified` | `Boolean` | Whether the prover's count met the threshold |
| `claim_initialized` | `Boolean` | Whether the one-time public threshold has been set |

**This is the minimum a verifier needs.** They know the bar was set to `N`
and whether the prover cleared it. Nothing else.

### Private Witness (circuit input only)

The following value is used **inside the ZK circuit** but is **never written
to the chain**:

| Input | Type | Meaning |
|---|---|---|
| `activity_count` | `Uint<64>` | A count the prover self-reports as private input |

The `activity_count` is supplied by the user as a circuit argument (a private
witness). The Compact compiler generates a ZK proof from this value. The proof
verifies the claim `activity_count >= threshold` without revealing the raw
number. This initial circuit does **not** verify the count's source or truth;
it proves only the comparison. A trusted attestation/oracle is future work.

A verifier can confirm the proof is valid and see `claim_verified = true` —
but they cannot determine whether the prover had exactly 10, 15, or 1000
activities. The raw count is cryptographically hidden.

### Why This Matters

This separation is the foundation of ProofShield's entire architecture. In
future levels, the private witness will be replaced with a signed attestation
from a trusted ProofShield Oracle. The Oracle verifies real GitHub data or CTF
completions off-chain and signs the result. The user submits that signature as
the private input. The Compact circuit verifies the signature without the
verifier ever seeing the raw data.

### MongoDB Records

Better Auth stores email/password users, Google OAuth users/accounts, sessions,
and verification records through the MongoDB adapter. The application also
creates `wallet_links` and `proof_records`. Wallet links associate the
connected public wallet address and network with the signed-in user. This is a
client-reported association, not a server-verified cryptographic ownership
signature. Proof
records are restricted to transaction hash, circuit, contract, public
threshold, and public pass/fail result. Raw activity counts, private witnesses,
wallet secrets, and serialized proof payloads are not stored. The browser's
proof form submits both Compact circuits through Midnight.js and the connected
wallet. The activity count is sent to the connected wallet for proving, but is
not submitted to ProofShield's API or stored by the server. Because wallet addresses and transaction hashes are
linked to account IDs, the ProofShield backend/database operator can associate
those public chain artifacts with the user's account. The Compact circuit does
not hide that metadata linkage; disclose it to users.

---

## Setup

### Prerequisites

- **macOS / Linux** (Apple Silicon supported)
- **Node.js** ≥ 22: `node --version`
- **Yarn** 1.x: `yarn --version` (installed via `npm install -g yarn`)
- **Compact CLI** 0.5.2: `compact --version`
  - Install from: https://midnight.network/download
- **Docker Desktop** installed and running (required for the Midnight Proof Server)

### Install dependencies

```bash
cd ~/risin/midnight-risin
yarn install
```

### Start the Midnight Proof Server (for local tests)

The Proof Server must be running before you run local tests. It is the service
that generates ZK proofs for your circuits.

Start the local node, indexer, and proof server together:
```bash
docker compose up -d --wait node indexer proof-server
```

---

## Launch Interactive Web UI

Run the API server and Vite, then use the landing page, authentication page,
profile, and dedicated proof page. The profile shows account details, linked
wallets, and histories. The proof page reads shared Preprod state and submits a
private-count transaction using the configured shared contract.
The current circuit proves the threshold comparison only; it does not attest
that the user-reported count is true.

```bash
# Launch development server:
yarn dev
# or:
npm run dev
```

Open **`http://localhost:5173/`**. Create an account or sign in at
`http://localhost:5173/auth.html`. After signing in, open
`http://localhost:5173/profile.html` or `http://localhost:5173/proof.html`.
Install Lace or 1AM to connect a Preprod wallet from the navbar. Never enter a
wallet seed or mnemonic into the web app.
Vite proxies `/api` to the Express server.

Open **Generate proof**, connect a Preprod wallet, enter the private activity
count and a strong 16+ character browser-storage password, then approve the
wallet prompt. The shared threshold is initialized to 10 by the deploy helper.
The app never sends the private count to its API. Users do not deploy contracts
or paste addresses; the project owner configures the single deployed address
through `VITE_CONTRACT_ADDRESS` in Vercel.

### Vercel demo and API

Import this public GitHub repository into Vercel with the root directory set
to `.`. `vercel.json` configures the Vite static output and `api/` contains
Vercel Node functions for Better Auth and private user-record APIs; a separate
Render backend is not required. Configure the server-only environment values
`MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in Vercel. Set
`BETTER_AUTH_URL=https://proofshild.vercel.app`. Never add `MONGODB_URI`, the
OAuth client secret, or auth secret to `VITE_*` variables. The same-origin
serverless API handles `/api/auth`, `/api/wallets`, and `/api/proofs`.

In Vercel Project → Settings → Environment Variables, add the six names above
for Production (and Preview if desired). Generate `BETTER_AUTH_SECRET` with
`openssl rand -base64 48`. Use the rotated Atlas database-user password in
`MONGODB_URI` and set `MONGODB_DB_NAME=proofshield`.

In Google Cloud Console, use the JavaScript origin
`https://proofshild.vercel.app` and redirect URI
`https://proofshild.vercel.app/api/auth/callback/google`. For local development
also register origin `http://localhost:5173` and redirect URI
`http://localhost:5173/api/auth/callback/google`. In Atlas, allow the Vercel
function's network egress to reach the cluster; avoid a broad `0.0.0.0/0` rule
unless you accept that exposure and have a restricted database user/password.
Rotate any database password that has been exposed, then use the replacement
in both local `.env` and Vercel's Production environment variables.

---

## Compile

Compile the Compact smart contract. This generates ZK circuits, proof keys,
and TypeScript bindings into `contract/managed/proofshield/`.

```bash
yarn compile
# equivalent: compact compile contract/proofshield.compact contract/managed/proofshield
```

The compiler reports the circuit count and generates their keys and bindings.
Progress detail varies by compiler build.
```
Compiling 2 circuits:
```

> 📸 **Screenshot 1:** Capture the successful compiler output for submission.

The `contract/managed/proofshield/` directory contains:
```
contract/managed/proofshield/
├── compiler/       ← contract ABI / metadata
├── contract/       ← TypeScript bindings (index.js, index.d.ts)
├── keys/           ← ZK proving and verifying keys
└── zkir/           ← Zero-Knowledge Intermediate Representation
```

---

## Testing

### Circuit logic tests

```bash
yarn test
```

These four tests execute the generated Compact circuits directly and check the
public ledger output:

1. **Deploy** — Contract deploys, initial state is `claim_verified=false`, `threshold=0`
2. **Initialise** — Threshold is set to 10; visible publicly on the ledger
3. **Pass proof** — Private count of 15 ≥ 10 → `claim_verified=true` (count stays private)
4. **Fail proof** — Private count of 5 < 10 → `claim_verified=false` (count stays private)

### Network integration tests

The integration suite deploys a contract and submits transactions, so it needs
a running Midnight node, indexer, proof server, and a wallet funded with NIGHT
and registered DUST. Run it with `yarn test:local`; use `yarn test:preprod` or
`yarn test:preview` for remote networks.

### Remote tests (Preview or Preprod)

1. Copy the example env file:
   ```bash
   cp .env.preprod.example .env.preprod
   ```
2. Edit `.env.preprod` and add your wallet seed or mnemonic
3. Fund your wallet from the faucet: https://midnight-tmnight-preprod.nethermind.dev/
---

## Deployment

Set up `.env.preprod` or `.env.preview` from its example with exactly one wallet
mnemonic or seed, fund the wallet, compile, then deploy:

```
MIDNIGHT_NETWORK=preprod yarn deploy
```

> 📸 **Screenshot 2 (for Rise In submission):** Capture the terminal output
> showing the contract address after successful deployment.

The helper compiles, deploys the contract, initializes the shared threshold to
10, and saves the resulting public address in ignored `deployment.json`. Never
commit wallet secrets.

To generate a Preprod contract address yourself:

1. Install and verify the Compact CLI from the [Midnight downloads page](https://midnight.network/download); `compact --version` must match this project's compiler version (`0.23` language).
2. Copy `.env.preprod.example` to `.env.preprod`; set exactly one of `MIDNIGHT_PREPROD_MNEMONIC` or `MIDNIGHT_PREPROD_SEED`. Keep this file private and never paste a wallet secret into the browser or GitHub.
3. Fund that wallet for Preprod transactions and ensure it has registered DUST using the Preprod faucet linked in the env template. Wait until funding is reflected on-chain.
4. Run `yarn install` then `yarn deploy` from the repository root. The helper compiles, waits for wallet sync, deploys, and initializes the shared threshold. It prints the authentic Preprod address and writes it to ignored `deployment.json`.
5. Add that public address as `VITE_CONTRACT_ADDRESS` in Vercel's project environment settings and redeploy. This is a one-time owner setup; end users never enter the address or run deployment commands. The address is safe to publish; the wallet seed/mnemonic is not.

Deployment submits an on-chain transaction and requires a funded wallet; this
repository does not deploy automatically during Vercel builds.

### Deployed contract address

| Network | Contract Address |
|---|---|
| Preprod | `<address recorded after deployment>` |
| Preview | — |

---

## Project Structure

```
midnight-risin/
├── index.html                       ← Landing page
├── auth.html                        ← Sign-in and registration
├── profile.html                     ← Account, wallets, transaction history
├── profile.js                      ← Authenticated profile data loader
├── wallet-navbar.js                ← Lace/1AM wallet integration
├── contract/                        ← Midnight Smart Contract Workspace
│   ├── proofshield.compact          ← The Compact smart contract (source of truth)
│   ├── index.ts                     ← TypeScript entry point for compiled contract
│   ├── managed/proofshield/         ← Auto-generated by compact compile (ZK keys, bindings)
│   │   ├── compiler/
│   │   ├── contract/
│   │   ├── keys/
│   │   └── zkir/
│   └── src/
│       ├── config.ts                ← Network configuration (local/preview/preprod)
│       ├── providers.ts             ← Midnight provider setup (ZK, indexer, wallet)
│       ├── wallet.ts                ← Wallet setup and sync logic
│       └── test/
│           └── proofshield.test.ts  ← Vitest integration test suite
├── index.html                       ← Web application root HTML
├── vite.config.ts                   ← Vite configuration
├── compose.yml                      ← Docker Compose for local Midnight devnet
├── .env.preprod.example             ← Template for Preprod credentials
├── .env.preview.example             ← Template for Preview credentials
├── package.json                     ← Root dependencies and orchestration scripts
├── tsconfig.json
└── vitest.config.ts
```

---

## Project Status

**Level 1 — New Moon** of the Rise In × Midnight "New Moon to Full: Monthly
Moonshots on Midnight" program.

- ✅ Level 1: Contract foundation (this repository)
- ✅ Level 2 foundation: Lace/1AM wallet connection and disconnect
- ✅ CI: Compile, build, and circuit logic tests
- ⬜ Browser circuit submission and live verifier queries
- ⬜ Level 4: MVP on Preprod with real platform adapters
- ⬜ Level 5: User onboarding (50 Preprod users)
- ⬜ Level 6: Mainnet launch

---

## License

MIT
