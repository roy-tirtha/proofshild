# ProofShield

> **Privacy-first technical achievement verification on the Midnight network.**

ProofShield is a Level 1 prototype of a privacy-preserving system that allows
individuals to prove specific technical claims — without exposing their full
personal history, raw credentials, or complete activity records.

---

## Initial Product Idea

ProofShield is designed to solve a real problem: today, proving a technical
qualification requires exposing far more personal information than is actually
necessary. A recruiter asking "does this person have networking experience and
10+ verified security activities?" currently receives an entire GitHub profile,
resume, or portfolio — information they did not need and the candidate may not
want to share.

ProofShield's goal is to change this with the following model:

> **Evidence → Verification → Privacy-preserving Proof**

A user gathers evidence from trusted sources (GitHub, CTF platforms,
certifications). ProofShield verifies that evidence against objective rules.
Then, using Midnight's zero-knowledge proof system, it produces a claim that a
verifier can check — seeing only the specific answer to their specific question,
nothing more.

This is not a certificate wallet. It is a selective-disclosure proof system for
technical achievements.

---

## Level 1 — New Moon (Current Scope)

This repository contains the **Level 1** prototype: the foundational Compact
smart contract for ProofShield, deployed to the Midnight Preprod/Preview network.

**What Level 1 includes:**
- A working Compact smart contract with two privacy circuits
- ZK proof generation for a technical achievement claim
- Contract compiled with `compact compile` (proof keys generated)
- Test suite verifying the core privacy model
- Deployment to Midnight Preprod or Preview network
- **Interactive React UI (`ui/`)**: A complete studio connecting the platform adapters, Compact ZK circuits, live proof server simulation, on-chain ledger state, and verifier portal.

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

If you already have it running via Docker:
```bash
docker ps  # Confirm proof server is running on port 6300
```

Or start it via Docker directly:
```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0
```

---

## Launch Interactive Web UI

ProofShield includes a React web application with a ZK Proof Studio and Verifier Portal running directly from the project root.

```bash
# Launch development server:
yarn dev
# or:
npm run dev
```

Open **`http://localhost:5173`** in your browser to interact with:
- **ZK Proof Studio**: Adjust thresholds, simulate platform adapters (GitHub, Hack The Box, TryHackMe), and trigger cryptographic ZK proof generation.
- **Verifier Portal**: Query public on-chain claims without leaking candidate identity or repository history.
- **Circuit & Privacy Inspector**: Live breakdown of `proofshield.compact` public state vs private witnesses.
- **Level 1 Deliverables**: Live test suite status and submission checklist.

---

## Compile

Compile the Compact smart contract. This generates ZK circuits, proof keys,
and TypeScript bindings into `contract/managed/proofshield/`.

```bash
yarn compile
# equivalent: compact compile contract/proofshield.compact contract/managed/proofshield
```

**Expected output:**
```
Compiling 2 circuits:
  circuit "initialise_claim" (k=7, rows=90)
  circuit "submit_proof" (k=9, rows=123)
Overall progress [====================] 2/2
```

> 📸 **Screenshot 1 (for Rise In submission):** Capture this terminal output
> showing both circuits compiled successfully.

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

### Local test (proof server must be running on port 6300)

```bash
MIDNIGHT_NETWORK=local yarn test
```

The test suite runs 4 tests that verify the core privacy model:

1. **Deploy** — Contract deploys, initial state is `claim_verified=false`, `threshold=0`
2. **Initialise** — Threshold is set to 10; visible publicly on the ledger
3. **Pass proof** — Private count of 15 ≥ 10 → `claim_verified=true` (count stays private)
4. **Fail proof** — Private count of 5 < 10 → `claim_verified=false` (count stays private)

### Remote tests (Preview or Preprod)

1. Copy the example env file:
   ```bash
   cp .env.preprod.example .env.preprod
   ```
2. Edit `.env.preprod` and add your wallet seed or mnemonic
3. Fund your wallet from the faucet: https://midnight-tmnight-preprod.nethermind.dev/
4. Run:
   ```bash
   MIDNIGHT_NETWORK=preprod yarn test
   ```

---

## Deployment

After running `yarn test:preprod` (or `yarn test:preview`), the test suite
deploys the contract and logs the contract address:

```
INFO: Contract deployed at: <contract-address>
```

> 📸 **Screenshot 2 (for Rise In submission):** Capture the terminal output
> showing the contract address after successful deployment.

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
- ⬜ Level 2: Frontend + Lace wallet integration
- ⬜ Level 3: Tests, CI/CD, production-grade contract
- ⬜ Level 4: MVP on Preprod with real platform adapters
- ⬜ Level 5: User onboarding (50 Preprod users)
- ⬜ Level 6: Mainnet launch

---

## License

MIT
