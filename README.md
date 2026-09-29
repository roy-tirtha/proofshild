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

This repository contains the ProofShield Compact contract, generated artifacts,
local integration tests, a deployment helper, and a Lace wallet connection flow.
It does not yet include a browser transaction adapter or a published Preprod
deployment.

**What Level 1 includes:**
- Compact source with two circuits and generated proving/verifying artifacts
- Local Midnight integration tests for deploy, threshold initialization, and passing/failing proofs
- A helper to deploy to Preview or Preprod and save the returned address
- Lace and 1AM DApp Connector wallet connect/disconnect in the Studio
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

**This is the minimum a verifier needs.** They know the bar was set to `N`
and whether the prover cleared it. Nothing else.

### Private Witness (circuit input only)

The following value is used **inside the ZK circuit** but is **never written
to the chain**:

| Input | Type | Meaning |
|---|---|---|
| `activity_count` | `Uint<64>` | The actual number of verified activities the prover has |

The `activity_count` is supplied as a circuit argument (a private witness). The
Compact compiler generates a ZK proof from this value. The proof verifies the
claim `activity_count >= threshold` without revealing the raw number.

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

Run Vite and open `/studio.html` to use the Lace connection panel. Proof
submission and on-chain verification remain disabled until the browser
Midnight.js transaction adapter is implemented and a contract is deployed.

```bash
# Launch development server:
yarn dev
# or:
npm run dev
```

Open **`http://localhost:5173/studio.html`** in a browser with Lace or 1AM
installed. If both are available, choose one in the wallet selector. Select
Preprod when prompted and approve the connection. Fund the wallet and ensure
DUST is available before any future transaction flow. Never enter a wallet
seed or mnemonic into the web app.

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

The helper prints the address returned by `deployContract` and saves it in the
ignored `deployment.json`. Set `VITE_CONTRACT_ADDRESS` to that value before
building the frontend to display it. Never commit wallet secrets.

### Deployed contract address

| Network | Contract Address |
|---|---|
| Preprod | `<address recorded after deployment>` |
| Preview | — |

---

## Project Structure

```
midnight-risin/
├── src/                             ← Web UI Application (React + Vite + Tailwind)
│   ├── App.tsx                      ← Interactive ZK Studio & Verifier Portal
│   ├── main.tsx                     ← React entry point
│   ├── index.css                    ← Cryptographic design tokens & styling
│   └── assets/
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
