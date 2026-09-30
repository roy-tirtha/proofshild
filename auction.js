let connectedWallet;
let connectedAddress;
let auctionState;
let transactionPending = false;
let privateRecords;
let privateStatePassword;

const defaultContractAddress = '7dce7dd497e7cfdd82a2176f04678106c13db9e9d05315590f58af383daf4eca';
let contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || localStorage.getItem('proofshield:auction-contract-address') || defaultContractAddress;
const byId = (id) => document.getElementById(id);
const phases = ['Not started', 'Bidding open', 'Reveal open', 'Finished'];

function setMessage(message) {
  byId('auction-message').textContent = message;
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
  try {
    const record = JSON.parse(encrypted);
    const key = await deriveEncryptionKey(password, hexToBytes(record.salt));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(record.iv) }, key, Uint8Array.from(atob(record.data), (char) => char.charCodeAt(0)));
    const value = JSON.parse(new TextDecoder().decode(plaintext));
    if (value.version !== 1 || !Array.isArray(value.bids)) throw new Error('Invalid private record.');
    return value;
  } catch {
    throw new Error('Could not open the encrypted bid data for this wallet and contract.');
  }
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
  byId('start-auction').disabled = !ready || phase !== 0;
  byId('commit-bid').disabled = !ready || phase !== 1;
  byId('close-bidding').disabled = !ready || phase !== 1 || !privateRecords?.ownerSecret;
  byId('reveal-bids').disabled = !ready || phase !== 2 || !privateRecords?.bids.some((bid) => auctionState.commitments.member(hexToBytes(bid.commitment)) && !auctionState.commitments.lookup(hexToBytes(bid.commitment)));
  byId('declare-winner').disabled = !ready || phase !== 2 || !privateRecords?.ownerSecret;
  byId('start-panel').hidden = phase !== 0;
  byId('commit-panel').hidden = phase !== 1;
  byId('reveal-panel').hidden = phase !== 2;
  byId('finished-panel').hidden = phase !== 3;
  byId('owner-actions').hidden = !privateRecords?.ownerSecret;
  byId('owner-finalize').hidden = !privateRecords?.ownerSecret;
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
  byId('final-result').textContent = hasWinner ? `Winning bid: ${state.highest_bid.toString()}` : 'No bid met the reserve.';
  byId('auction-chain-status').textContent = 'Connected to Midnight Preprod';
  renderPrivateBids();
  updateControls();
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

async function withAuction(circuit, args) {
  if (!connectedWallet) throw new Error('Connect a Lace or 1AM wallet first.');
  const client = await import('./proof-client.js');
  const session = await client.createAuctionSession(connectedWallet, privateStatePassword);
  try {
    const result = await client.submitAuctionCircuit(session.providers, contractAddress, circuit, args);
    await refreshState();
    return result.txHash || result.txId || result.identifiers?.[0];
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
  await refreshState();
  await unlockRecords();
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
  refreshState();
});

byId('start-auction').addEventListener('click', () => runAction('start-auction', 'Starting auction on Preprod…', async () => {
  const reserve = byId('reserve-input').value;
  if (!/^[1-9]\d*$/.test(reserve) || BigInt(reserve) > 18446744073709551615n) throw new Error('Enter a positive whole-number reserve.');
  const records = await loadPrivateRecords();
  if (records.ownerSecret && Number(auctionState?.phase) !== 0) throw new Error('This wallet already created this auction.');
  const secret = records.ownerSecret ? hexToBytes(records.ownerSecret) : randomSecret();
  if (!records.ownerSecret) {
    records.ownerSecret = bytesToHex(secret);
    await savePrivateRecords(records);
  }
  await withAuction('start_auction', [BigInt(reserve), secret]);
}));

byId('commit-bid').addEventListener('click', () => runAction('commit-bid', 'Sealing your bid on Preprod…', async () => {
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

byId('close-bidding').addEventListener('click', () => runAction('close-bidding', 'Closing the bidding phase on Preprod…', async () => {
  const records = await loadPrivateRecords();
  if (!records.ownerSecret) throw new Error('Creator key not found in this wallet’s encrypted browser data.');
  await withAuction('close_bidding', [hexToBytes(records.ownerSecret)]);
}));

byId('reveal-bids').addEventListener('click', () => runAction('reveal-bids', 'Revealing your committed bids on Preprod…', async () => {
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

byId('declare-winner').addEventListener('click', () => runAction('declare-winner', 'Declaring the winner and publishing results on Preprod…', async () => {
  const records = await loadPrivateRecords();
  if (!records.ownerSecret) throw new Error('Creator key not found in this wallet’s encrypted browser data.');
  await withAuction('finalize_auction', [hexToBytes(records.ownerSecret)]);
}));

byId('auction-contract-address').textContent = contractAddress;
renderPrivateBids();
updateControls();
refreshState();
window.setInterval(refreshState, 15000);
