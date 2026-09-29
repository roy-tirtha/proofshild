const byId = (id) => document.getElementById(id);

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
    window.location.replace('auth.html?returnTo=profile');
    return;
  }

  const user = session.user;
  byId('profile-name').textContent = user.name || 'Name not provided';
  byId('profile-email').textContent = user.email || 'Email not provided';
  byId('profile-organization').textContent = user.organization || 'Not provided';
  byId('profile-created').textContent = formatDate(user.createdAt);
  byId('profile-loading').hidden = true;
  byId('profile-view').hidden = false;
  const results = await Promise.allSettled([loadWallets()]);
  if (results[0].status === 'rejected') addEmptyMessage(byId('wallet-list'), results[0].reason.message);
}

window.addEventListener('proofshield:wallet-connected', async (event) => {
  const { api, address, name } = event.detail;
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
});

window.addEventListener('proofshield:wallet-disconnected', () => {
  byId('wallet-message').textContent = 'Wallet disconnected from this app.';
  addEmptyMessage(byId('chain-history'), 'Connect your wallet to load its recent transactions from Midnight.');
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
