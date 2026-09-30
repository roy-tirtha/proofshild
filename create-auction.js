let walletApi;
let walletAddress;
const button = document.getElementById('create-auction-button');
const status = document.getElementById('create-auction-status');

function setStatus(message) { status.textContent = message; }

async function readApiJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`The auction API route returned HTML rather than JSON (HTTP ${response.status}). Open the local app at http://localhost:3000, or redeploy the current Vercel commit containing api/auctions.js.`);
  }
  return response.json();
}

async function sessionUser() {
  const response = await fetch('/api/auth/get-session', { credentials: 'include' });
  const session = response.ok ? await readApiJson(response) : null;
  if (!session?.user) throw new Error('Sign in before creating and publishing an auction.');
}

async function savePrivateOwnerRecord(address, password, secret) {
  const keyLabel = `proofshield:auction-private:${address}:${walletAddress.toLowerCase()}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const content = new TextEncoder().encode(JSON.stringify({ version: 1, ownerSecret: Array.from(secret, (byte) => byte.toString(16).padStart(2, '0')).join(''), bids: [] }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, content));
  const toHex = (value) => Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(keyLabel, JSON.stringify({ salt: toHex(salt), iv: toHex(iv), data: btoa(Array.from(encrypted, (byte) => String.fromCharCode(byte)).join('')) }));
}

async function loadPrivateOwnerSecret(address, password) {
  const keyLabel = `proofshield:auction-private:${address}:${walletAddress.toLowerCase()}`;
  const record = JSON.parse(localStorage.getItem(keyLabel) || 'null');
  if (!record) throw new Error('The saved creator key for this pending auction is missing from this browser.');
  const fromHex = (value) => Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromHex(record.salt), iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(record.iv) }, key, Uint8Array.from(atob(record.data), (char) => char.charCodeAt(0)));
  const privateState = JSON.parse(new TextDecoder().decode(plaintext));
  if (privateState.version !== 1 || !/^[0-9a-f]{64}$/i.test(privateState.ownerSecret || '')) throw new Error('The saved creator key is invalid. It remains encrypted in this browser.');
  return fromHex(privateState.ownerSecret);
}

function pendingAuctionKey() {
  return `proofshield:pending-auction:${walletAddress.toLowerCase()}`;
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
  let deployedAddress;
  let deploymentTransactionId;
  let startTransactionId;
  try {
    await sessionUser();
    const pending = JSON.parse(localStorage.getItem(pendingAuctionKey()) || 'null');
    const title = pending?.title || document.getElementById('create-title').value.trim();
    const reserve = pending?.reserve || document.getElementById('create-reserve').value;
    if (!title || title.length > 100) throw new Error('Enter a title between 1 and 100 characters.');
    if (!/^[1-9]\d*$/.test(reserve) || BigInt(reserve) > 18446744073709551615n) throw new Error('Enter a positive whole-number reserve.');
    const client = await import('./proof-client.js');
    deploymentTransactionId = pending?.deploymentTransactionId;
    startTransactionId = pending?.startTransactionId;
    const password = await client.getAuctionPrivateStatePassword(walletApi);
    setStatus(pending ? 'Resuming the pending auction in this wallet window…' : 'Preparing the wallet transaction session…');
    const session = await client.createAuctionSession(walletApi, password);
    try {
      deployedAddress = pending?.contractAddress;
      let secret;
      if (deployedAddress) {
        secret = await loadPrivateOwnerSecret(deployedAddress, password);
      } else {
        setStatus('Deploying a new auction contract. Approve the deployment in your connected wallet…');
        const deployment = await client.deployAuctionWithProviders(session.providers);
        deployedAddress = deployment.contractAddress;
        deploymentTransactionId = deployment.transactionId;
        localStorage.setItem('proofshield:auction-contract-address', deployedAddress);
        secret = crypto.getRandomValues(new Uint8Array(32));
        await savePrivateOwnerRecord(deployedAddress, password, secret);
        localStorage.setItem(pendingAuctionKey(), JSON.stringify({
          contractAddress: deployedAddress,
          title,
          reserve,
          deploymentTransactionId,
        }));
      }
      const state = pending ? await client.readAuctionState(session.providers, deployedAddress) : null;
      if (!state || Number(state.phase) === 0) {
        await client.waitForWalletTransactions(walletApi, (count) => {
          setStatus(`Waiting for ${count} earlier wallet transaction${count === 1 ? '' : 's'} to confirm before starting bidding…`);
        });
        setStatus('Starting bidding on the new contract. Approve the transaction in the same wallet window…');
        const startResult = await client.submitAuctionCircuit(session.providers, deployedAddress, 'start_auction', [BigInt(reserve), secret]);
        startTransactionId = client.transactionReference(startResult);
        localStorage.setItem(pendingAuctionKey(), JSON.stringify({
          contractAddress: deployedAddress,
          title,
          reserve,
          deploymentTransactionId,
          startTransactionId,
        }));
      }
    } finally {
      await session.dispose().catch(() => {});
    }
    setStatus('Auction started. Publishing it to the shared catalogue…');
    const response = await fetch('/api/auctions', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractAddress: deployedAddress, title, creatorWallet: walletAddress }),
    });
    const body = await readApiJson(response);
    if (!response.ok) throw new Error(body.error || 'The auction is live but could not be added to the catalogue.');
    if (deploymentTransactionId) {
      await client.recordAuctionActivity({ contractAddress: deployedAddress, action: 'auction_deployed', transactionId: deploymentTransactionId, walletAddress });
    }
    if (startTransactionId) {
      await client.recordAuctionActivity({ contractAddress: deployedAddress, action: 'bidding_started', transactionId: startTransactionId, walletAddress });
    }
    localStorage.removeItem(pendingAuctionKey());
    window.location.assign(`auction.html?contract=${encodeURIComponent(deployedAddress)}&title=${encodeURIComponent(title)}`);
  } catch (error) {
    const suffix = deployedAddress ? ` Contract address: ${deployedAddress}` : '';
    const message = error instanceof Error ? error.message : 'Auction creation failed.';
    const walletConflict = /active in another window|another window/i.test(message);
    setStatus(`${walletConflict ? 'Your wallet is active in another app window. Switch to the ProofShield tab where it is connected, or close the other ProofShield tabs, reconnect here, and retry.' : message}${suffix}`);
  } finally {
    button.disabled = !walletApi;
  }
});
