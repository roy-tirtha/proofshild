let walletApi;
let walletAddress;
const button = document.getElementById('create-auction-button');
const status = document.getElementById('create-auction-status');

function setStatus(message) { status.textContent = message; }

async function readApiJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(`Auction API returned HTML instead of JSON (HTTP ${response.status}). Open the local app at http://localhost:3000, or redeploy the latest Vercel commit.`);
  return response.json();
}

async function sessionUser() {
  const response = await fetch('/api/auth/get-session', { credentials: 'include' });
  const session = response.ok ? await readApiJson(response) : null;
  if (!session?.user) throw new Error('Sign in before creating an auction.');
}

async function saveEncryptedOwnerRecord(client, auctionId, password, ownerSecret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const privateData = new TextEncoder().encode(JSON.stringify({ version: 1, ownerSecret: client.bytesToHex(ownerSecret), bids: [] }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, privateData));
  const encode = (bytes) => client.bytesToHex(bytes);
  const data = btoa(Array.from(ciphertext, (byte) => String.fromCharCode(byte)).join(''));
  localStorage.setItem(`proofshield:auction-private:v3:${auctionId}:${walletAddress.toLowerCase()}`, JSON.stringify({ salt: encode(salt), iv: encode(iv), data }));
}

function pendingKey() { return `proofshield:pending-auction:${walletAddress.toLowerCase()}`; }
function validPendingAuction(value) {
  return Boolean(value && /^[0-9a-f]{64}$/i.test(value.auctionId || '') && typeof value.title === 'string' && value.title.trim().length >= 1 && value.title.trim().length <= 100 && typeof value.reserve === 'string' && /^[1-9]\d*$/.test(value.reserve) && typeof value.transactionId === 'string' && value.transactionId.length >= 1 && value.transactionId.length <= 256);
}

window.addEventListener('proofshield:wallet-connected', (event) => {
  walletApi = event.detail.api;
  walletAddress = event.detail.address;
  button.disabled = false;
  setStatus(`Connected: ${walletAddress.slice(0, 10)}…`);
});

window.addEventListener('proofshield:wallet-disconnected', () => {
  walletApi = undefined;
  walletAddress = undefined;
  button.disabled = true;
  setStatus('Connect a Lace or 1AM wallet to continue.');
});

button.addEventListener('click', async () => {
  if (!walletApi || !walletAddress) return setStatus('Connect a wallet first.');
  button.disabled = true;
  try {
    await sessionUser();
    let pending = JSON.parse(localStorage.getItem(pendingKey()) || 'null');
    if (pending && !validPendingAuction(pending)) {
      pending = null;
      setStatus('The saved draft has incomplete identifiers. I’ll create a fresh auction ID and transaction, then publish that new auction. The earlier on-chain auction remains unchanged.');
    }
    const title = pending?.title || document.getElementById('create-title').value.trim();
    const reserve = pending?.reserve || document.getElementById('create-reserve').value;
    if (!title || title.length > 100) throw new Error('Enter a title between 1 and 100 characters.');
    if (!/^[1-9]\d*$/.test(reserve) || BigInt(reserve) > 18446744073709551615n) throw new Error('Enter a positive whole-number reserve.');

    const client = await import('./proof-client.js');
    let auctionIdHex = pending?.auctionId;
    let transactionId = pending?.transactionId;
    if (!pending) {
      const auctionId = client.createAuctionId();
      auctionIdHex = client.auctionIdToHex(auctionId);
      const ownerSecret = crypto.getRandomValues(new Uint8Array(32));
      const storagePassword = await client.getAuctionPrivateStatePassword(walletApi);
      const session = await client.createAuctionSession(walletApi, storagePassword);
      try {
        setStatus('Creating this auction in the shared Midnight contract. Approve the transaction in your wallet…');
        await client.waitForWalletTransactions(walletApi, (count) => setStatus(`Waiting for ${count} earlier wallet transaction${count === 1 ? '' : 's'} to finalize…`));
        const result = await client.submitAuctionCircuit(session.providers, client.sharedContractAddress(), 'create_auction', [auctionId, BigInt(reserve), ownerSecret], walletApi, setStatus);
        transactionId = client.transactionReference(result);
        await saveEncryptedOwnerRecord(client, auctionIdHex, storagePassword, ownerSecret);
        localStorage.setItem(pendingKey(), JSON.stringify({ auctionId: auctionIdHex, title, reserve, transactionId }));
      } finally {
        await session.dispose().catch(() => {});
      }
    }
    const invalidListingFields = [];
    if (!/^[0-9a-f]{64}$/i.test(auctionIdHex || '')) invalidListingFields.push('auction ID');
    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 100) invalidListingFields.push('title');
    if (typeof walletAddress !== 'string' || walletAddress.trim().length < 1 || walletAddress.length > 256) invalidListingFields.push('creator wallet');
    if (typeof transactionId !== 'string' || transactionId.length < 1 || transactionId.length > 256) invalidListingFields.push('creation transaction reference');
    if (invalidListingFields.length) throw new Error(`The saved auction cannot be published because its ${invalidListingFields.join(', ')} ${invalidListingFields.length === 1 ? 'is' : 'are'} invalid. The auction transaction already exists; keep this browser data and retry after fixing the issue.`);
    setStatus('Publishing the on-chain auction to the shared catalogue…');
    const response = await fetch('/api/auctions', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auctionId: auctionIdHex, title, creatorWallet: walletAddress, transactionId }),
    });
    const body = await readApiJson(response);
    if (!response.ok) throw new Error(body.error || 'The auction is on-chain, but its catalogue entry could not be saved. Retry to publish the same auction.');
    await client.recordAuctionActivity({ contractAddress: client.sharedContractAddress(), auctionId: auctionIdHex, action: 'auction_created', transactionId, walletAddress });
    localStorage.removeItem(pendingKey());
    window.location.assign(`auction.html?auction=${encodeURIComponent(auctionIdHex)}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Auction creation failed.');
  } finally {
    button.disabled = !walletApi;
  }
});
