let connectedWallet;
let connectedAddress;
let auctionState;
let transactionPending = false;

const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || '';
const byId = (id) => document.getElementById(id);

function setMessage(message) {
  byId('auction-message').textContent = message;
}

function updateControls() {
  const configured = Boolean(contractAddress);
  const connected = Boolean(connectedWallet);
  const phase = Number(auctionState?.phase ?? 0);
  byId('auction-address-warning').hidden = configured;
  if (!configured) {
    byId('auction-address-warning').textContent = 'The app owner has not configured a deployed Preprod auction contract. You do not need to deploy or enter an address.';
  }
  byId('auction-start').disabled = transactionPending || !configured || !connected || phase !== 0;
  byId('auction-commit').disabled = transactionPending || !configured || !connected || phase !== 1;
  byId('auction-close').disabled = transactionPending || !configured || !connected || phase !== 1;
  byId('auction-reveal').disabled = transactionPending || !configured || !connected || phase !== 2;
  byId('auction-finalize').disabled = transactionPending || !configured || !connected || phase !== 2;
}

function renderState(state) {
  auctionState = state;
  const phases = ['Not started', 'Commit phase', 'Reveal phase', 'Finalized'];
  const winner = state.winning_commitment.some((byte) => byte !== 0)
    ? ` · Leading bid: ${state.highest_bid.toString()}`
    : ' · No revealed bid currently meets the reserve';
  byId('auction-ledger').textContent = `Status: ${phases[Number(state.phase)] ?? 'Unknown'} · Reserve: ${state.reserve_price.toString()} · Commitments: ${state.commitments.size().toString()} · Revealed: ${state.reveal_count.toString()}${winner}`;
  updateControls();
}

async function refreshState() {
  if (!contractAddress) {
    updateControls();
    return;
  }
  try {
    const { readPreprodAuctionState } = await import('./proof-client.js');
    renderState(await readPreprodAuctionState(contractAddress));
  } catch (error) {
    byId('auction-ledger').textContent = error.message || 'Could not read the live auction state.';
  }
}

async function withAuction(action) {
  if (!connectedWallet) throw new Error('Connect a Lace or 1AM wallet on Preprod first.');
  const importClient = await import('./proof-client.js');
  const password = action.password;
  const session = await importClient.createAuctionSession(connectedWallet, password);
  try {
    const tx = await importClient.submitAuctionCircuit(session.providers, contractAddress, action.circuit, action.args ?? []);
    const txHash = tx.txHash || tx.txId || tx.identifiers?.[0];
    await refreshState();
    return txHash;
  } finally {
    await session.dispose().catch(() => {});
  }
}

function randomSalt() {
  return crypto.getRandomValues(new Uint8Array(32));
}

function downloadReceipt(receipt) {
  const blob = new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const receiptType = receipt.format === 'proofshield-auction-owner-v1' ? 'owner' : 'bid';
  link.download = `sealed-auction-${receiptType}-${(receipt.commitment ?? receipt.contractAddress).slice(0, 12)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function runButton(buttonId, status, action) {
  const button = byId(buttonId);
  transactionPending = true;
  updateControls();
  button.disabled = true;
  setMessage(status);
  try {
    const txHash = await action();
    setMessage(txHash ? `${status.replace(/…$/, '')} Transaction: ${txHash}` : 'Transaction confirmed.');
  } catch (error) {
    setMessage(error.message || 'The auction transaction failed.');
  } finally {
    transactionPending = false;
    updateControls();
  }
}

window.addEventListener('proofshield:wallet-connected', async (event) => {
  connectedWallet = event.detail.api;
  connectedAddress = event.detail.address;
  updateControls();
  await refreshState();
  if (connectedAddress) setMessage(`Wallet connected: ${connectedAddress.slice(0, 8)}…${connectedAddress.slice(-6)}`);
});

window.addEventListener('proofshield:wallet-disconnected', () => {
  connectedWallet = undefined;
  connectedAddress = undefined;
  updateControls();
  setMessage('Wallet disconnected.');
});

byId('auction-start').addEventListener('click', () => runButton('auction-start', 'Starting auction…', async () => {
  const reserve = byId('auction-reserve').value;
  if (!/^[1-9]\d*$/.test(reserve) || BigInt(reserve) > 18446744073709551615n) throw new Error('Enter a positive whole-number reserve that fits in Uint<64>.');
  const { bytesToHex } = await import('./proof-client.js');
  const ownerSecret = randomSalt();
  const txHash = await withAuction({ circuit: 'start_auction', args: [BigInt(reserve), ownerSecret], password: byId('auction-password').value });
  downloadReceipt({
    format: 'proofshield-auction-owner-v1',
    network: 'preprod',
    contractAddress,
    secret: bytesToHex(ownerSecret),
    transaction: txHash ?? null,
  });
  return txHash;
}));

byId('auction-commit').addEventListener('click', () => runButton('auction-commit', 'Creating private commitment…', async () => {
  const amount = byId('auction-bid').value;
  if (!/^(0|[1-9]\d*)$/.test(amount) || BigInt(amount) > 18446744073709551615n) throw new Error('Enter a whole-number bid that fits in Uint<64>.');
  const { bytesToHex, createBidCommitment } = await import('./proof-client.js');
  const salt = randomSalt();
  const commitment = createBidCommitment(amount, salt);
  const txHash = await withAuction({ circuit: 'commit_bid', args: [commitment], password: byId('auction-password').value });
  downloadReceipt({
    format: 'proofshield-sealed-bid-v1',
    network: 'preprod',
    contractAddress,
    bidAmount: amount,
    salt: bytesToHex(salt),
    commitment: bytesToHex(commitment),
    commitmentTransaction: txHash ?? null,
  });
  byId('auction-bid').value = '';
  return txHash;
}));

async function readOwnerSecret(inputId) {
  const file = byId(inputId).files?.[0];
  if (!file) throw new Error('Choose the private auction creator receipt JSON first.');
  const receipt = JSON.parse(await file.text());
  if (receipt.format !== 'proofshield-auction-owner-v1' || receipt.network !== 'preprod' || receipt.contractAddress !== contractAddress || !/^[\da-f]{64}$/i.test(receipt.secret)) {
    throw new Error('This is not a valid creator receipt for this auction.');
  }
  const { hexToBytes } = await import('./proof-client.js');
  return hexToBytes(receipt.secret);
}

byId('auction-close').addEventListener('click', () => runButton('auction-close', 'Closing commit phase…', async () => withAuction({
  circuit: 'close_bidding',
  args: [await readOwnerSecret('auction-owner-receipt-close')],
  password: byId('auction-password').value,
})));

byId('auction-reveal').addEventListener('click', () => runButton('auction-reveal', 'Verifying and revealing bid…', async () => {
  const file = byId('auction-receipt').files?.[0];
  if (!file) throw new Error('Choose the private bid receipt JSON first.');
  const receipt = JSON.parse(await file.text());
  if (receipt.format !== 'proofshield-sealed-bid-v1' || receipt.network !== 'preprod' || receipt.contractAddress !== contractAddress) {
    throw new Error('This receipt is for a different app, network, or auction contract.');
  }
  if (!/^(0|[1-9]\d*)$/.test(receipt.bidAmount) || !/^[\da-f]{64}$/i.test(receipt.salt)) throw new Error('The receipt is malformed.');
  const { hexToBytes, createBidCommitment } = await import('./proof-client.js');
  const salt = hexToBytes(receipt.salt);
  const commitment = createBidCommitment(receipt.bidAmount, salt);
  if (commitment.length !== 32 || commitment.some((byte, index) => byte !== hexToBytes(receipt.commitment)[index])) {
    throw new Error('The bid or salt in this receipt does not match its commitment.');
  }
  return withAuction({ circuit: 'reveal_bid', args: [BigInt(receipt.bidAmount), salt], password: byId('auction-password').value });
}));

byId('auction-finalize').addEventListener('click', () => runButton('auction-finalize', 'Finalizing auction…', async () => withAuction({
  circuit: 'finalize_auction',
  args: [await readOwnerSecret('auction-owner-receipt-finalize')],
  password: byId('auction-password').value,
})));

byId('auction-contract-address').textContent = contractAddress || 'Not configured';
updateControls();
refreshState();
