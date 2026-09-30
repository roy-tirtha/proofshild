let walletApi;
let walletAddress;
let auction;
let privateRecords;
let privateStatePassword;
let transactionPending = false;

const query = new URLSearchParams(window.location.search);
const auctionId = query.get('auction')?.toLowerCase() || '';
const resultsView = document.body.dataset.auctionView === 'results';
const byId = (id) => document.getElementById(id);
const phases = ['Not started', 'Bidding open', 'Reveal open', 'Finished'];

function setMessage(message) { byId('auction-message').textContent = message; }
function validId(value) { return /^[0-9a-f]{64}$/i.test(value || ''); }
function bytesToHex(bytes) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) { return Uint8Array.from((hex.match(/.{2}/g) || []), (part) => Number.parseInt(part, 16)); }
function privateKey() {
  if (!walletAddress) throw new Error('Connect your wallet before accessing private auction data.');
  return 'proofshield:auction-private:v3:' + auctionId + ':' + walletAddress.toLowerCase();
}
async function encryptionKey(password, salt) {
  const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function loadPrivateRecords() {
  if (!privateStatePassword) throw new Error('Connect your wallet before accessing private auction data.');
  const saved = localStorage.getItem(privateKey());
  if (!saved) return { version: 1, ownerSecret: null, bids: [] };
  const envelope = JSON.parse(saved);
  const key = await encryptionKey(privateStatePassword, hexToBytes(envelope.salt));
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(envelope.iv) }, key, Uint8Array.from(atob(envelope.data), (char) => char.charCodeAt(0)));
  const value = JSON.parse(new TextDecoder().decode(clear));
  if (value.version !== 1 || !Array.isArray(value.bids)) throw new Error('Saved private auction data is invalid.');
  return value;
}
async function savePrivateRecords(records) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(privateStatePassword, salt);
  const clear = new TextEncoder().encode(JSON.stringify(records));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear));
  localStorage.setItem(privateKey(), JSON.stringify({ salt: bytesToHex(salt), iv: bytesToHex(iv), data: btoa(Array.from(data, (byte) => String.fromCharCode(byte)).join('')) }));
  privateRecords = records;
  renderPrivateBids();
}
function renderPrivateBids() {
  const list = byId('my-bids');
  if (!list) return;
  if (!walletAddress) { list.textContent = 'Connect a wallet to view your private bids.'; return; }
  if (!privateRecords?.bids.length) { list.textContent = 'No private bids are stored for this auction in this browser.'; return; }
  list.replaceChildren(...privateRecords.bids.map((bid, index) => {
    const item = document.createElement('div');
    item.className = 'private-bid-row';
    item.textContent = 'Bid ' + (index + 1) + ' · ' + bid.amount + ' · sealed commitment stored locally';
    return item;
  }));
}
function updateControls() {
  const phase = Number(auction?.phase ?? -1);
  const ready = Boolean(walletApi && auction && !transactionPending);
  const disable = (id, value) => { if (byId(id)) byId(id).disabled = value; };
  disable('commit-bid', !ready || phase !== 1);
  disable('close-bidding', !ready || phase !== 1 || !privateRecords?.ownerSecret);
  disable('reveal-bids', !ready || phase !== 2 || !privateRecords?.bids.length);
  disable('declare-winner', !ready || phase !== 2 || !privateRecords?.ownerSecret);
  if (byId('commit-panel')) byId('commit-panel').hidden = phase !== 1;
  if (byId('reveal-panel')) byId('reveal-panel').hidden = phase !== 2;
  if (byId('finished-panel')) byId('finished-panel').hidden = phase !== 3;
  if (byId('owner-actions')) byId('owner-actions').hidden = !privateRecords?.ownerSecret;
  if (byId('owner-finalize')) byId('owner-finalize').hidden = !privateRecords?.ownerSecret;
}
function renderAuction(nextAuction) {
  auction = nextAuction;
  byId('phase-value').textContent = phases[Number(auction.phase)] || 'Unknown';
  byId('reserve-value').textContent = auction.reserve.toString();
  byId('commitment-count').textContent = auction.sealedCount.toString();
  byId('revealed-count').textContent = auction.revealedCount.toString();
  byId('leading-bid').textContent = auction.hasWinner ? auction.highestBid.toString() : '—';
  if (byId('final-result')) byId('final-result').textContent = auction.hasWinner ? 'Winning revealed bid: ' + auction.highestBid : 'No revealed bid met the reserve.';
  byId('auction-chain-status').textContent = 'Live state from Midnight Preprod';
  updateControls();
}
async function refreshAuction() {
  if (!validId(auctionId)) return;
  try {
    const client = await import('./proof-client.js');
    byId('auction-contract-address').textContent = client.sharedContractAddress();
    if (byId('auction-id-value')) byId('auction-id-value').textContent = auctionId;
    renderAuction(await client.readPreprodAuction(auctionId));
  } catch (error) {
    byId('auction-chain-status').textContent = 'Live Preprod state unavailable';
    setMessage(error instanceof Error ? error.message : 'Could not load on-chain state.');
  }
}
async function requireSignedIn() {
  const response = await fetch('/api/auth/get-session', { credentials: 'include' });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('application/json') || !(await response.json())?.user) throw new Error('Sign in before submitting a transaction so its public reference can be saved.');
}
async function submit(circuitId, args, activity) {
  if (!walletApi) throw new Error('Connect a Lace or 1AM wallet first.');
  await requireSignedIn();
  const client = await import('./proof-client.js');
  const session = await client.createAuctionSession(walletApi, privateStatePassword);
  try {
    await client.waitForWalletTransactions(walletApi, (count) => setMessage('Waiting for ' + count + ' earlier wallet transaction' + (count === 1 ? '' : 's') + ' to finalize…'));
    const result = await client.submitAuctionCircuit(session.providers, client.sharedContractAddress(), circuitId, args, walletApi, setMessage);
    const transactionId = client.transactionReference(result);
    await client.recordAuctionActivity({ contractAddress: client.sharedContractAddress(), auctionId, action: activity, transactionId, walletAddress });
    await refreshAuction();
    return transactionId;
  } finally { await session.dispose().catch(() => {}); }
}
async function run(buttonId, message, action) {
  transactionPending = true; updateControls(); setMessage(message);
  try { setMessage('Transaction submitted: ' + await action()); }
  catch (error) { setMessage(error instanceof Error ? error.message : 'Transaction failed.'); }
  finally { transactionPending = false; updateControls(); byId(buttonId)?.blur(); }
}
async function loadForWallet() {
  if (!walletApi || !walletAddress || !validId(auctionId)) return;
  const client = await import('./proof-client.js');
  privateStatePassword = await client.getAuctionPrivateStatePassword(walletApi);
  privateRecords = await loadPrivateRecords();
  const ownerKey = 'proofshield:auction-owner:' + auctionId + ':' + walletAddress.toLowerCase();
  const ownerSecret = localStorage.getItem(ownerKey);
  if (ownerSecret && !privateRecords.ownerSecret) {
    privateRecords.ownerSecret = ownerSecret;
    await savePrivateRecords(privateRecords);
    localStorage.removeItem(ownerKey);
  }
  renderPrivateBids(); updateControls();
}
async function showAuctionChooser() {
  const response = await fetch('/api/auctions', { credentials: 'include' });
  const payload = await response.json();
  const target = document.querySelector('.auction-content, .results-wrap');
  const chooser = document.createElement('section');
  chooser.className = 'auction-panel result-card';
  chooser.innerHTML = '<h2>Select an auction</h2><p>Choose an auction from the shared Midnight contract.</p>';
  for (const item of payload.auctions || []) {
    const link = document.createElement('a');
    link.className = 'auction-button result-link';
    link.href = (resultsView ? 'auction-results.html' : 'auction.html') + '?auction=' + encodeURIComponent(item.auctionId);
    link.textContent = item.title;
    chooser.append(link);
  }
  target.append(chooser);
}
window.addEventListener('proofshield:wallet-connected', async (event) => {
  walletApi = event.detail.api; walletAddress = event.detail.address;
  if (byId('wallet-address')) byId('wallet-address').textContent = walletAddress.slice(0, 12) + '…' + walletAddress.slice(-8);
  try { await loadForWallet(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not unlock local private data.'); }
});
window.addEventListener('proofshield:wallet-disconnected', () => {
  walletApi = undefined; walletAddress = undefined; privateRecords = undefined; privateStatePassword = undefined;
  if (byId('wallet-address')) byId('wallet-address').textContent = 'Not connected';
  renderPrivateBids(); updateControls();
});
byId('commit-bid')?.addEventListener('click', () => run('commit-bid', 'Sealing your bid in the shared Midnight contract…', async () => {
  const amount = byId('bid-input').value;
  if (!/^(0|[1-9]\d*)$/.test(amount) || BigInt(amount) > 18446744073709551615n) throw new Error('Enter a non-negative whole-number bid.');
  const client = await import('./proof-client.js');
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const commitment = client.createBidCommitment(amount, salt);
  const records = await loadPrivateRecords();
  records.bids.push({ amount, salt: bytesToHex(salt), commitment: bytesToHex(commitment) });
  await savePrivateRecords(records);
  return submit('commit_bid', [client.auctionIdFromHex(auctionId), commitment], 'bid_committed');
}));
byId('close-bidding')?.addEventListener('click', () => run('close-bidding', 'Closing bidding in the shared Midnight contract…', async () => {
  const client = await import('./proof-client.js');
  return submit('close_bidding', [client.auctionIdFromHex(auctionId), hexToBytes(privateRecords.ownerSecret)], 'bidding_closed');
}));
byId('reveal-bids')?.addEventListener('click', () => run('reveal-bids', 'Revealing saved bids one at a time…', async () => {
  const client = await import('./proof-client.js'); let lastTx;
  for (const bid of privateRecords.bids) lastTx = await submit('reveal_bid', [client.auctionIdFromHex(auctionId), BigInt(bid.amount), hexToBytes(bid.salt)], 'bid_revealed');
  return lastTx;
}));
byId('declare-winner')?.addEventListener('click', () => run('declare-winner', 'Finalizing the auction in the shared Midnight contract…', async () => {
  const client = await import('./proof-client.js');
  return submit('finalize_auction', [client.auctionIdFromHex(auctionId), hexToBytes(privateRecords.ownerSecret)], 'winner_declared');
}));
if (!validId(auctionId)) {
  byId('auction-chain-status').textContent = 'Select an auction to continue.';
  showAuctionChooser().catch((error) => setMessage(error.message));
} else {
  refreshAuction(); window.setInterval(refreshAuction, 15000);
}
renderPrivateBids(); updateControls();
