let connectedWallet;
let connectedAddress;
let auctionState;
let transactionPending = false;
let privateRecords;
let privateStatePassword;

const defaultContractAddress = '7dce7dd497e7cfdd82a2176f04678106c13db9e9d05315590f58af383daf4eca';
const query = new URLSearchParams(window.location.search);
const hasSelectedContract = Boolean(query.get('contract'));
let contractAddress = (query.get('contract') || import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || localStorage.getItem('proofshield:auction-contract-address') || defaultContractAddress).toLowerCase();
if (!/^[0-9a-f]{64}$/i.test(contractAddress)) contractAddress = defaultContractAddress;
const view = document.body.dataset.auctionView || 'bid';
const byId = (id) => document.getElementById(id);
const phases = ['Not started', 'Bidding open', 'Reveal open', 'Finished'];
const activityForCircuit = {
  commit_bid: 'bid_committed',
  close_bidding: 'bidding_closed',
  reveal_bid: 'bid_revealed',
  finalize_auction: 'winner_declared',
};

function setMessage(message) {
  byId('auction-message').textContent = message;
}

async function readAuctionApi(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`The auction API route returned HTML rather than JSON (HTTP ${response.status}). Open the local app at http://localhost:3000, or redeploy the current Vercel commit containing api/auctions.js.`);
  }
  return response.json();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function emptyPrivateRecords() {
  return { version: 1, ownerSecret: null, bids: [] };
}

function privateRecordKey() {
  if (!connectedAddress) throw new Error('Connect your wallet before accessing your private bids.');
  return `proofshield:auction-private:${contractAddress}:${connectedAddress.toLowerCase()}`;
}

async function deriveEncryptionKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function loadPrivateRecords() {
  const password = privateStatePassword;
  if (!password) throw new Error('Connect your wallet before accessing private auction data.');
  const encrypted = localStorage.getItem(privateRecordKey());
  if (!encrypted) return emptyPrivateRecords();
  const legacyKey = `proofshield:auction-device-key:${contractAddress}:${connectedAddress.toLowerCase()}`;
  const passwords = [...new Set([password, localStorage.getItem(legacyKey)].filter(Boolean))];
  const record = JSON.parse(encrypted);
  for (const candidate of passwords) {
    try {
      const key = await deriveEncryptionKey(candidate, hexToBytes(record.salt));
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(record.iv) }, key, Uint8Array.from(atob(record.data), (char) => char.charCodeAt(0)));
      const value = JSON.parse(new TextDecoder().decode(plaintext));
      if (value.version !== 1 || !Array.isArray(value.bids)) continue;
      if (candidate !== password) await savePrivateRecords(value);
      return value;
    } catch {}
  }
  throw new Error('Could not unlock private auction data from this browser. Existing creator keys and bid salts were preserved; do not clear site storage.');
}

async function savePrivateRecords(records) {
  const password = privateStatePassword;
  if (!password) throw new Error('Connect your wallet before saving private auction data.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(records)));
  const bytes = new Uint8Array(ciphertext);
  const data = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  localStorage.setItem(privateRecordKey(), JSON.stringify({ salt: bytesToHex(salt), iv: bytesToHex(iv), data }));
  privateRecords = records;
  renderPrivateBids();
}

function renderPrivateBids() {
  const list = byId('my-bids');
  if (!privateRecords || privateRecords.bids.length === 0) {
    list.textContent = connectedAddress ? 'Your private bids will appear here after you commit.' : 'Connect a wallet to view your private bids.';
    return;
  }
  list.replaceChildren();
  privateRecords.bids.forEach((bid, index) => {
    const item = document.createElement('div');
    item.className = 'private-bid-row';
    const description = document.createElement('span');
    const commitment = hexToBytes(bid.commitment);
    const onChain = Boolean(auctionState?.commitments.member(commitment));
    const revealed = onChain && Boolean(auctionState.commitments.lookup(commitment));
    description.textContent = `Bid ${index + 1} · ${bid.amount} · ${revealed ? 'Revealed on-chain' : onChain ? 'Sealed on-chain' : 'Not confirmed'}`;
    const shortCommitment = document.createElement('code');
    shortCommitment.textContent = `${bid.commitment.slice(0, 10)}…${bid.commitment.slice(-8)}`;
    item.append(description, shortCommitment);
    list.append(item);
  });
}

function updateControls() {
  const phase = Number(auctionState?.phase ?? -1);
  const ready = Boolean(connectedWallet && auctionState && !transactionPending);
  const setDisabled = (id, disabled) => { if (byId(id)) byId(id).disabled = disabled; };
  const setHidden = (id, hidden) => { if (byId(id)) byId(id).hidden = hidden; };
  setDisabled('start-auction', !ready || phase !== 0);
  setDisabled('commit-bid', !ready || phase !== 1);
  setDisabled('close-bidding', !ready || phase !== 1 || !privateRecords?.ownerSecret);
  setDisabled('reveal-bids', !ready || phase !== 2 || !privateRecords?.bids.some((bid) => auctionState.commitments.member(hexToBytes(bid.commitment)) && !auctionState.commitments.lookup(hexToBytes(bid.commitment))));
  setDisabled('declare-winner', !ready || phase !== 2 || !privateRecords?.ownerSecret);
  setHidden('start-panel', phase !== 0);
  setHidden('commit-panel', phase !== 1);
  setHidden('reveal-panel', phase !== 2);
  setHidden('finished-panel', phase !== 3);
  document.querySelectorAll('[data-view="bid"]').forEach((element) => { element.hidden = view === 'results'; });
  document.querySelectorAll('[data-view="results"]').forEach((element) => { element.hidden = view !== 'results'; });
  if (byId('owner-actions')) byId('owner-actions').hidden = !privateRecords?.ownerSecret;
  if (byId('owner-finalize')) byId('owner-finalize').hidden = !privateRecords?.ownerSecret;
  byId('phase-value').textContent = auctionState ? phases[phase] ?? 'Unknown' : 'Connecting to Preprod…';
}

function renderState(state) {
  auctionState = state;
  const phase = Number(state.phase);
  byId('phase-value').textContent = phases[phase] ?? 'Unknown';
  byId('reserve-value').textContent = state.reserve_price.toString();
  byId('commitment-count').textContent = state.commitments.size().toString();
  byId('revealed-count').textContent = state.reveal_count.toString();
  const hasWinner = state.winning_commitment.some((byte) => byte !== 0);
  byId('leading-bid').textContent = hasWinner ? state.highest_bid.toString() : '—';
  if (byId('final-result')) byId('final-result').textContent = hasWinner ? `Winning bid: ${state.highest_bid.toString()}` : 'No bid met the reserve.';
  byId('auction-chain-status').textContent = 'Connected to Midnight Preprod';
  renderPrivateBids();
  updateControls();
}

async function requireSignedIn() {
  const response = await fetch('/api/auth/get-session', { credentials: 'include' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    throw new Error('Sign in before submitting an auction transaction so its activity can be saved.');
  }
  const session = await response.json();
  if (!session?.user) throw new Error('Sign in before submitting an auction transaction so its activity can be saved.');
}

async function refreshState() {
  try {
    const { readPreprodAuctionState } = await import('./proof-client.js');
    renderState(await readPreprodAuctionState(contractAddress));
  } catch (error) {
    auctionState = undefined;
    byId('auction-chain-status').textContent = 'Live Preprod state unavailable';
    byId('phase-value').textContent = 'Unavailable';
    setMessage(error.message || 'Could not read auction state from Preprod.');
    updateControls();
  }
}

async function showAuctionChooser() {
  const resultsView = view === 'results';
  document.querySelectorAll(resultsView ? '.result-address, .result-metrics, .result-card' : '.auction-address, .auction-metrics, .auction-grid').forEach((element) => { element.hidden = true; });
  byId('auction-title').textContent = resultsView ? 'Declare a winner' : 'Choose an auction to bid on';
  const intro = document.querySelector(resultsView ? '.results-wrap > p' : '.auction-intro');
  intro.textContent = resultsView
    ? 'Select an auction to close bidding, reveal your bid, or publish its result.'
    : 'Select a live auction to submit a sealed bid.';
  const chooser = document.createElement('section');
  chooser.className = resultsView ? 'result-card' : 'auction-panel';
  chooser.style.marginTop = '24px';
  chooser.innerHTML = '<h2>Select an auction</h2><p class="panel-intro" id="auction-picker-status">Loading registered auctions…</p><div id="auction-picker-list"></div>';
  const pickerList = chooser.querySelector('#auction-picker-list');
  pickerList.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px';
  (resultsView ? byId('auction-contract-address').closest('.result-address') : byId('auction-contract-address').closest('.auction-address')).before(chooser);
  const status = chooser.querySelector('#auction-picker-status');
  const list = chooser.querySelector('#auction-picker-list');
  try {
    const response = await fetch('/api/auctions', { credentials: 'include' });
    const payload = await readAuctionApi(response);
    if (!response.ok) throw new Error(payload.error || 'Auction catalogue is unavailable.');
    if (!payload.auctions.length) {
      status.textContent = 'No published auctions are available yet.';
      return;
    }
    const { readPreprodAuctionState } = await import('./proof-client.js');
    const cards = await Promise.all(payload.auctions.map(async (auction) => {
      const card = document.createElement('article');
      card.className = resultsView ? 'result-card' : 'auction-panel';
      card.style.margin = '0';
      const heading = document.createElement('h3');
      heading.textContent = auction.title;
      const address = document.createElement('code');
      address.textContent = auction.contractAddress;
      card.append(heading);
      try {
        const state = await readPreprodAuctionState(auction.contractAddress);
        const phase = Number(state.phase);
        const names = ['Not started', 'Bidding open', 'Reveal open', 'Finished'];
        const summary = document.createElement('p');
        summary.textContent = `${names[phase] || 'Unknown'} · Reserve ${state.reserve_price} · ${state.commitments.size()} sealed bids`;
        card.append(summary);
        const isRelevant = resultsView ? phase === 1 || phase === 2 : phase === 1;
        if (isRelevant) {
          const action = document.createElement('a');
          action.className = resultsView ? 'result-link' : 'auction-button';
          action.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;text-decoration:none';
          action.href = `${resultsView ? 'auction-results.html' : 'auction.html'}?contract=${encodeURIComponent(auction.contractAddress)}&title=${encodeURIComponent(auction.title)}`;
          action.textContent = resultsView ? (phase === 1 ? 'Close bidding' : 'Reveal / declare winner') : 'Select to bid';
          card.append(action);
        }
      } catch (error) {
        const problem = document.createElement('p');
        problem.textContent = `Live Preprod state unavailable: ${error.message}`;
        card.append(problem);
      }
      card.append(address);
      return card;
    }));
    list.replaceChildren(...cards);
    status.textContent = 'Live state is verified against Midnight Preprod.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Auction catalogue is unavailable.';
  }
}

async function withAuction(circuit, args) {
  if (!connectedWallet) throw new Error('Connect a Lace or 1AM wallet first.');
  await requireSignedIn();
  const client = await import('./proof-client.js');
  const session = await client.createAuctionSession(connectedWallet, privateStatePassword);
  try {
    await client.waitForWalletTransactions(connectedWallet, (count) => {
      setMessage(`Waiting for ${count} earlier wallet transaction${count === 1 ? '' : 's'} to confirm before continuing…`);
    });
    const result = await client.submitAuctionCircuit(
      session.providers,
      contractAddress,
      circuit,
      args,
      connectedWallet,
      setMessage,
    );
    const transactionId = client.transactionReference(result);
    await client.recordAuctionActivity({
      contractAddress,
      action: activityForCircuit[circuit],
      transactionId,
      walletAddress: connectedAddress,
    });
    await refreshState();
    return transactionId;
  } finally {
    await session.dispose().catch(() => {});
  }
}

function randomSecret() {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function runAction(buttonId, message, action) {
  const button = byId(buttonId);
  transactionPending = true;
  updateControls();
  setMessage(message);
  try {
    const txId = await action();
    setMessage(txId ? `Transaction submitted: ${txId}` : 'Transaction confirmed on Midnight Preprod.');
    return true;
  } catch (error) {
    setMessage(error instanceof Error ? error.message : 'Transaction failed.');
    return false;
  } finally {
    transactionPending = false;
    updateControls();
    button.blur();
  }
}

async function unlockRecords() {
  if (!connectedAddress) return;
  try {
    privateRecords = await loadPrivateRecords();
    renderPrivateBids();
    updateControls();
  } catch (error) {
    privateRecords = undefined;
    updateControls();
    setMessage(error.message);
  }
}

window.addEventListener('proofshield:wallet-connected', async (event) => {
  connectedWallet = event.detail.api;
  connectedAddress = event.detail.address;
  byId('wallet-address').textContent = `${connectedAddress.slice(0, 12)}…${connectedAddress.slice(-8)}`;
  privateRecords = undefined;
  const client = await import('./proof-client.js');
  privateStatePassword = await client.getAuctionPrivateStatePassword(connectedWallet);
  if (hasSelectedContract) await refreshState();
  if (hasSelectedContract) await unlockRecords();
  updateControls();
});

window.addEventListener('proofshield:wallet-disconnected', () => {
  connectedWallet = undefined;
  connectedAddress = undefined;
  privateStatePassword = undefined;
  privateRecords = undefined;
  byId('wallet-address').textContent = 'Not connected';
  renderPrivateBids();
  updateControls();
});

window.addEventListener('proofshield:auction-deployed', (event) => {
  contractAddress = event.detail.address;
  byId('auction-contract-address').textContent = contractAddress;
  if (hasSelectedContract) refreshState();
});

byId('commit-bid')?.addEventListener('click', () => runAction('commit-bid', 'Sealing your bid on Preprod…', async () => {
  const amount = byId('bid-input').value;
  if (!/^(0|[1-9]\d*)$/.test(amount) || BigInt(amount) > 18446744073709551615n) throw new Error('Enter a non-negative whole-number bid.');
  const records = await loadPrivateRecords();
  const salt = randomSecret();
  const { bytesToHex, createBidCommitment } = await import('./proof-client.js');
  const commitment = createBidCommitment(amount, salt);
  records.bids.push({ amount, salt: bytesToHex(salt), commitment: bytesToHex(commitment) });
  await savePrivateRecords(records);
  await withAuction('commit_bid', [commitment]);
  byId('bid-input').value = '';
}));

byId('close-bidding')?.addEventListener('click', () => runAction('close-bidding', 'Closing the bidding phase on Preprod…', async () => {
  const records = await loadPrivateRecords();
  if (!records.ownerSecret) throw new Error('Creator key not found in this wallet’s encrypted browser data.');
  await withAuction('close_bidding', [hexToBytes(records.ownerSecret)]);
}));

byId('reveal-bids')?.addEventListener('click', () => runAction('reveal-bids', 'Revealing your committed bids on Preprod…', async () => {
  const records = await loadPrivateRecords();
  const { createBidCommitment } = await import('./proof-client.js');
  for (const bid of records.bids) {
    const salt = hexToBytes(bid.salt);
    const commitment = createBidCommitment(bid.amount, salt);
    if (bytesToHex(commitment) !== bid.commitment) throw new Error('A saved private bid failed its commitment integrity check.');
    if (!auctionState?.commitments.member(commitment)) continue;
    if (!auctionState.commitments.lookup(commitment)) await withAuction('reveal_bid', [BigInt(bid.amount), salt]);
  }
}));

byId('declare-winner')?.addEventListener('click', () => runAction('declare-winner', 'Declaring the winner and publishing results on Preprod…', async () => {
  const records = await loadPrivateRecords();
  if (!records.ownerSecret) throw new Error('Creator key not found in this wallet’s encrypted browser data.');
  await withAuction('finalize_auction', [hexToBytes(records.ownerSecret)]);
}));

byId('auction-contract-address').textContent = contractAddress;
const title = query.get('title');
if (title) byId('auction-title').textContent = title;
const titleElement = document.querySelector('title');
if (title && titleElement) titleElement.textContent = `${title} — ProofShield`;
for (const link of document.querySelectorAll('a[href="auction.html"], a[href="auction-results.html"]')) {
  const target = link.getAttribute('href');
  const parameters = new URLSearchParams({ contract: contractAddress });
  if (title) parameters.set('title', title);
  link.href = `${target}?${parameters}`;
}
renderPrivateBids();
updateControls();
if (hasSelectedContract) {
  refreshState();
  window.setInterval(refreshState, 15000);
} else {
  showAuctionChooser();
}
