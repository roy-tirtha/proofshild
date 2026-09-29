let connectedWallet;
let connectedAddress;
let proofClientPromise;
let claimState;

const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || '';
const byId = (id) => document.getElementById(id);

function getProofClient() {
  proofClientPromise ??= import('./proof-client.js');
  return proofClientPromise;
}

function setMessage(message) {
  byId('proof-message').textContent = message;
}

function updateProofControls() {
  const hasContract = Boolean(contractAddress);
  const claimReady = Boolean(claimState?.claim_initialized);
  byId('proof-submit').disabled = !hasContract || !connectedWallet || !claimReady;
  if (!hasContract) {
    byId('proof-address-warning').textContent = 'The app owner has not configured the Preprod contract yet. You do not need to deploy or paste an address; please try again after ProofShield is configured.';
    byId('proof-address-warning').hidden = false;
  }
}

function renderClaimState(state) {
  claimState = state;
  byId('proof-ledger-state').textContent = state.claim_initialized
    ? `Public threshold: ${state.threshold.toString()} · Latest public result: ${state.claim_verified ? 'PASS' : 'NOT PROVEN / FAIL'}`
    : 'The shared ProofShield contract has not been initialized. Please try again later.';
  updateProofControls();
}

async function refreshClaimState() {
  if (!contractAddress) {
    updateProofControls();
    return;
  }
  setMessage('Reading ProofShield’s public Preprod state…');
  try {
    const { readPreprodClaimState } = await getProofClient();
    renderClaimState(await readPreprodClaimState(contractAddress));
    setMessage('On-chain state is up to date.');
  } catch (error) {
    setMessage(error.message || 'Could not read the contract state.');
  }
}

async function recordPublicProofMetadata({ txHash, threshold, claimVerified }) {
  const response = await fetch('/api/proofs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      network: 'preprod',
      walletAddress: connectedAddress,
      contractAddress,
      transactionHash: txHash,
      circuit: 'submit_proof',
      threshold: String(threshold),
      claimVerified,
    }),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error('The proof transaction succeeded, but its public record could not be saved to your profile.');
  }
}

window.addEventListener('proofshield:wallet-connected', async (event) => {
  connectedWallet = event.detail.api;
  connectedAddress = event.detail.address;
  updateProofControls();
  await refreshClaimState();
});

window.addEventListener('proofshield:wallet-disconnected', () => {
  connectedWallet = undefined;
  connectedAddress = undefined;
  updateProofControls();
  byId('proof-ledger-state').textContent = 'Connect a Preprod wallet to read the shared contract state and submit a proof.';
});

byId('proof-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const activityCount = byId('proof-count').value;
  const storagePassword = byId('proof-storage-password').value;
  if (!/^(0|[1-9]\d*)$/.test(activityCount) || BigInt(activityCount) > 18446744073709551615n) {
    setMessage('Enter a whole-number count that fits in Uint<64>.');
    return;
  }
  if (!connectedWallet) {
    setMessage('Connect a Lace or 1AM wallet on Preprod first.');
    return;
  }
  if (!claimState?.claim_initialized) {
    setMessage('The shared contract is not ready yet.');
    return;
  }

  const button = byId('proof-submit');
  button.disabled = true;
  button.textContent = 'Generating proof…';
  setMessage('Your connected wallet is generating the proof. Approve the transaction in your wallet…');
  try {
    const { createProofSession, readClaimState, submitClaimCircuit } = await getProofClient();
    const session = await createProofSession(connectedWallet, storagePassword);
    try {
      const tx = await submitClaimCircuit(session.providers, contractAddress, 'submit_proof', activityCount);
      const state = await readClaimState(session.providers, contractAddress);
      renderClaimState(state);
      const txHash = tx.txHash || tx.txId || tx.identifiers?.[0];
      if (!txHash) throw new Error('Transaction was submitted, but its hash could not be read.');
      await recordPublicProofMetadata({ txHash, threshold: state.threshold, claimVerified: state.claim_verified });
      byId('proof-count').value = '';
      setMessage(`Proof transaction finalized: ${txHash}. Your private count was not sent to ProofShield’s server.`);
    } finally {
      await session.dispose().catch(() => {});
    }
  } catch (error) {
    setMessage(error.message || 'Could not generate or submit the proof.');
  } finally {
    button.textContent = 'Generate & submit proof';
    updateProofControls();
  }
});

async function initializeProofPage() {
  const response = await fetch('/api/auth/get-session', { credentials: 'include' });
  const session = response.ok ? await response.json() : null;
  if (!session?.user) {
    window.location.replace('auth.html?returnTo=proof');
    return;
  }
  byId('proof-contract-address').textContent = contractAddress || 'Not configured';
  updateProofControls();
  await refreshClaimState();
}

initializeProofPage().catch((error) => setMessage(error.message || 'Could not initialize the proof page.'));
