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
    const title = document.getElementById('create-title').value.trim();
    const reserve = document.getElementById('create-reserve').value;
    if (!title || title.length > 100) throw new Error('Enter a title between 1 and 100 characters.');
    if (!/^[1-9]\d*$/.test(reserve) || BigInt(reserve) > 18446744073709551615n) throw new Error('Enter a positive whole-number reserve.');

    const client = await import('./proof-client.js');
    const auctionId = client.createAuctionId();
    const auctionIdHex = client.auctionIdToHex(auctionId);
    const ownerSecret = crypto.getRandomValues(new Uint8Array(32));
    const storagePassword = await client.getAuctionPrivateStatePassword(walletApi);
    const session = await client.createAuctionSession(walletApi, storagePassword);
    try {
      setStatus('Creating this auction in the shared Midnight contract. Approve the transaction in your wallet…');
      await client.waitForWalletTransactions(walletApi, (count) => setStatus(`Waiting for ${count} earlier wallet transaction${count === 1 ? '' : 's'} to finalize…`));
      const result = await client.submitAuctionCircuit(session.providers, client.sharedContractAddress(), 'create_auction', [auctionId, BigInt(reserve), ownerSecret], walletApi, setStatus);
      const transactionId = client.transactionReference(result);
      localStorage.setItem(`proofshield:auction-owner:${auctionIdHex}:${walletAddress.toLowerCase()}`, client.bytesToHex(ownerSecret));
      const response = await fetch('/api/auctions', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auctionId: auctionIdHex, title, creatorWallet: walletAddress, transactionId }),
      });
      const body = await readApiJson(response);
      if (!response.ok) throw new Error(body.error || 'The auction was created on-chain but could not be published to the catalogue.');
      await client.recordAuctionActivity({ contractAddress: client.sharedContractAddress(), auctionId: auctionIdHex, action: 'auction_created', transactionId, walletAddress });
      window.location.assign(`auction.html?auction=${encodeURIComponent(auctionIdHex)}`);
    } finally {
      await session.dispose().catch(() => {});
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Auction creation failed.');
  } finally {
    button.disabled = !walletApi;
  }
});
