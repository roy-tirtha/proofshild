const byId = (id) => document.getElementById(id);
let connectedWallet;
let connectedAddress;
let proofClientPromise;

function getProofClient() {
  proofClientPromise ??= import('./proof-client.js');
  return proofClientPromise;
}

const configuredContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
const savedContractAddress = localStorage.getItem('proofshield:preprod-contract-address');
byId('proof-contract-address').value = configuredContractAddress || savedContractAddress || '';

function setProofMessage(message) {
  byId('proof-message').textContent = message;
}

function contractAddressValue() {
  const address = byId('proof-contract-address').value.trim();
  if (!address) throw new Error('Enter the deployed Preprod contract address first.');
  localStorage.setItem('proofshield:preprod-contract-address', address);
  return address;
}

async function withProofSession(action) {
  if (!connectedWallet) throw new Error('Connect a Lace or 1AM wallet on Preprod first.');
  const password = byId('proof-storage-password').value;
  const { createProofSession } = await getProofClient();
  const session = await createProofSession(connectedWallet, password);
  try {
    return await action(session.providers, contractAddressValue());
  } finally {
    await session.dispose().catch(() => {});
  }
}

function renderClaimState(state) {
  const initialized = state.claim_initialized;
  byId('proof-ledger-state').textContent = initialized
    ? `On-chain threshold: ${state.threshold.toString()} · Claim result: ${state.claim_verified ? 'PASS' : 'NOT PROVEN / FAIL'}`
    : 'No threshold has been initialized on this contract yet.';
  byId('proof-initialize').disabled = initialized || !connectedWallet;
  byId('proof-submit').disabled = !initialized || !connectedWallet;
  if (initialized) byId('proof-threshold').value = state.threshold.toString();
}

async function refreshClaimState() {
  setProofMessage('Reading public state from the Preprod indexer…');
  try {
    const { readPreprodClaimState } = await getProofClient();
    const state = await readPreprodClaimState(contractAddressValue());
    renderClaimState(state);
    setProofMessage('Public contract state updated.');
  } catch (error) {
    setProofMessage(error.message || 'Could not read contract state.');
  }
}

async function recordPublicProofMetadata({ transactionHash, circuit, threshold, claimVerified }) {
  if (!transactionHash) return;
  const response = await fetch('/api/proofs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      network: 'preprod',
      walletAddress: connectedAddress,
      contractAddress: contractAddressValue(),
      transactionHash,
      circuit,
      threshold: String(threshold),
      claimVerified,
    }),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error('Transaction succeeded, but its public metadata could not be saved to your profile.');
  }
  await loadProofHistory();
}

async function runClaimCircuit(circuit, value) {
  return withProofSession(async (providers, address) => {
    const { readClaimState, submitClaimCircuit } = await getProofClient();
    const tx = await submitClaimCircuit(providers, address, circuit, value);
    const state = await readClaimState(providers, address);
    renderClaimState(state);
    const txHash = tx.txHash || tx.txId || tx.identifiers?.[0];
    await recordPublicProofMetadata({
      transactionHash: txHash,
      circuit,
      threshold: state.threshold,
      claimVerified: state.claim_verified,
    });
    return txHash;
  });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function addEmptyMessage(container, message) {
  const paragraph = document.createElement('p');
  paragraph.className = 'profile-muted';
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
}

function addHistoryItem(container, { title, detail, hash, status }) {
  const item = document.createElement('article');
  item.className = 'history-item';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const state = document.createElement('small');
  state.textContent = status;
  const description = document.createElement('small');
  description.textContent = detail;
  const transaction = document.createElement('code');
  transaction.textContent = hash;
  item.append(heading, state, description, transaction);
  container.append(item);
}

function renderWallets(wallets) {
  const list = byId('wallet-list');
  if (!wallets.length) {
    addEmptyMessage(list, 'No wallet is linked to this account yet.');
    return;
  }
  list.replaceChildren();
  wallets.forEach((wallet) => {
    const item = document.createElement('article');
    item.className = 'wallet-item';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `${wallet.walletName} · ${wallet.network}`;
    const address = document.createElement('span');
    address.className = 'wallet-address';
    address.textContent = wallet.walletAddress;
    details.append(name, address);
    const unlink = document.createElement('button');
    unlink.className = 'profile-button';
    unlink.type = 'button';
    unlink.textContent = 'Unlink';
    unlink.addEventListener('click', async () => {
      unlink.disabled = true;
      try {
        const response = await fetch(`/api/wallets/${encodeURIComponent(wallet._id)}`, {
          method: 'DELETE', credentials: 'include',
        });
        if (!response.ok) throw new Error('Wallet could not be unlinked.');
        await loadWallets();
      } catch (error) {
        byId('wallet-message').textContent = error.message;
        unlink.disabled = false;
      }
    });
    item.append(details, unlink);
    list.append(item);
  });
}

async function loadWallets() {
  const response = await fetch('/api/wallets', { credentials: 'include' });
  if (!response.ok) throw new Error('Could not load linked wallets.');
  const result = await response.json();
  renderWallets(result.wallets ?? []);
}

async function loadProofHistory() {
  const response = await fetch('/api/proofs', { credentials: 'include' });
  if (!response.ok) throw new Error('Could not load proof transaction records.');
  const result = await response.json();
  const records = result.proofs ?? [];
  const list = byId('proof-history');
  if (!records.length) {
    addEmptyMessage(list, 'No proof transactions have been recorded for this account.');
    return;
  }
  list.replaceChildren();
  records.forEach((record) => addHistoryItem(list, {
    title: `${record.circuit} · ${record.network}`,
    detail: `Threshold ${record.threshold} · ${formatDate(record.createdAt)}`,
    hash: record.transactionHash,
    status: record.claimVerified ? 'Verified' : 'Recorded',
  }));
}

function renderChainHistory(entries) {
  const list = byId('chain-history');
  if (!entries.length) {
    addEmptyMessage(list, 'No transactions were returned for this wallet.');
    return;
  }
  list.replaceChildren();
  entries.forEach((entry) => addHistoryItem(list, {
    title: 'Midnight transaction',
    detail: entry.txStatus?.status ?? 'Status unavailable',
    hash: entry.txHash,
    status: entry.txStatus?.status ?? 'Unknown',
  }));
}

async function initializeProfile() {
  const response = await fetch('/api/auth/get-session', { credentials: 'include' });
  const session = response.ok ? await response.json() : null;
  if (!session?.user) {
    const nextPage = window.location.hash === '#proof-console-heading' ? 'proof' : 'profile';
    window.location.replace(`auth.html?returnTo=${nextPage}`);
    return;
  }

  const user = session.user;
  byId('profile-name').textContent = user.name || 'Name not provided';
  byId('profile-email').textContent = user.email || 'Email not provided';
  byId('profile-organization').textContent = user.organization || 'Not provided';
  byId('profile-created').textContent = formatDate(user.createdAt);
  byId('profile-loading').hidden = true;
  byId('profile-view').hidden = false;
  if (window.location.hash === '#proof-console-heading') {
    requestAnimationFrame(() => byId('proof-console-heading').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const results = await Promise.allSettled([loadWallets(), loadProofHistory()]);
  if (results[0].status === 'rejected') addEmptyMessage(byId('wallet-list'), results[0].reason.message);
  if (results[1].status === 'rejected') addEmptyMessage(byId('proof-history'), results[1].reason.message);
}

window.addEventListener('proofshield:wallet-connected', async (event) => {
  const { api, address, name } = event.detail;
  connectedWallet = api;
  connectedAddress = address;
  byId('proof-refresh').disabled = false;
  byId('wallet-message').textContent = `${name} is connected on Preprod.`;
  try {
    const history = await api.getTxHistory(0, 25);
    renderChainHistory(history);
  } catch {
    addEmptyMessage(byId('chain-history'), 'Could not load transaction history from this wallet.');
  }
  try {
    await loadWallets();
  } catch {
    byId('wallet-message').textContent = `Connected address: ${address}. Sign-in is required to save it to your profile.`;
  }
  await refreshClaimState();
});

window.addEventListener('proofshield:wallet-disconnected', () => {
  connectedWallet = undefined;
  connectedAddress = undefined;
  byId('proof-refresh').disabled = true;
  byId('proof-initialize').disabled = true;
  byId('proof-submit').disabled = true;
  byId('proof-ledger-state').textContent = 'Connect a Preprod wallet to inspect or use the contract.';
  byId('wallet-message').textContent = 'Wallet disconnected from this app.';
  addEmptyMessage(byId('chain-history'), 'Connect your wallet to load its recent transactions from Midnight.');
});

byId('proof-refresh').addEventListener('click', refreshClaimState);

byId('proof-initialize').addEventListener('click', async () => {
  const threshold = byId('proof-threshold').value;
  if (!/^[1-9]\d*$/.test(threshold) || BigInt(threshold) > 18446744073709551615n) {
    setProofMessage('Enter a whole-number threshold that fits in Uint<64>.');
    return;
  }
  byId('proof-initialize').disabled = true;
  setProofMessage('Generating and submitting the threshold-initialization transaction. Approve the wallet prompt…');
  try {
    const txHash = await runClaimCircuit('initialise_claim', threshold);
    setProofMessage(`Threshold transaction finalized: ${txHash}`);
  } catch (error) {
    setProofMessage(error.message || 'Threshold transaction failed.');
  } finally {
    byId('proof-initialize').disabled = false;
  }
});

byId('proof-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const activityCount = byId('proof-count').value;
  if (!/^(0|[1-9]\d*)$/.test(activityCount) || BigInt(activityCount) > 18446744073709551615n) {
    setProofMessage('Enter a whole-number private count that fits in Uint<64>.');
    return;
  }
  byId('proof-submit').disabled = true;
  setProofMessage('Creating the zero-knowledge proof in your connected wallet. The count is not sent to the ProofShield server. Approve the wallet prompt…');
  try {
    const txHash = await runClaimCircuit('submit_proof', activityCount);
    byId('proof-count').value = '';
    setProofMessage(`Proof transaction finalized: ${txHash}. Your raw count was not included in the public transaction state.`);
  } catch (error) {
    setProofMessage(error.message || 'Proof transaction failed.');
  } finally {
    byId('proof-submit').disabled = false;
  }
});

byId('profile-signout').addEventListener('click', async () => {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
  window.location.replace('index.html');
});

initializeProfile().catch((error) => {
  byId('profile-loading').hidden = true;
  byId('profile-error').textContent = error.message || 'Could not load your profile.';
  byId('profile-error').hidden = false;
});
