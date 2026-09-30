import '@midnight-ntwrk/dapp-connector-api';

document.addEventListener('DOMContentLoaded', () => {
  const buttons = [...document.querySelectorAll('[data-wallet-connect]')];
  const liveRegion = document.querySelector('[data-wallet-status]');
  if (!buttons.length) return;

  let connectedApi;
  let connectedName;
  let connectedAddress;

  window.proofshieldWallet = {
    getConnectedWallet: () => connectedApi,
  };

  const updateButtons = (message) => {
    const connected = Boolean(connectedApi);
    buttons.forEach((button) => {
      button.textContent = connected
        ? `Disconnect ${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
        : 'Connect wallet';
      button.title = connected ? `${connectedName}: ${connectedAddress}` : 'Connect Lace or 1AM wallet';
      button.setAttribute('aria-label', connected
        ? `Disconnect ${connectedName} wallet ${connectedAddress}`
        : 'Connect a Midnight wallet');
    });
    if (liveRegion && message) liveRegion.textContent = message;
  };

  const disconnect = () => {
    window.dispatchEvent(new CustomEvent('proofshield:wallet-disconnected'));
    connectedApi = undefined;
    connectedName = undefined;
    connectedAddress = undefined;
    updateButtons('Wallet disconnected from this app.');
  };

  buttons.forEach((button) => button.addEventListener('click', async () => {
    if (connectedApi) {
      disconnect();
      return;
    }

    button.disabled = true;
    button.textContent = 'Connecting…';
    try {
      const wallets = Object.entries(window.midnight ?? {});
      if (!wallets.length) {
        throw new Error('No Midnight wallet detected. Install Lace or 1AM, then refresh.');
      }
      const [walletId, wallet] = wallets.find(([, item]) => /lace/i.test(item.name)) ?? wallets[0];
      const api = await wallet.connect('preprod');
      const [{ unshieldedAddress }, connection] = await Promise.all([
        api.getUnshieldedAddress(),
        api.getConnectionStatus(),
      ]);
      if (connection.status !== 'connected') throw new Error('Wallet connection was not established.');

      connectedApi = api;
      connectedName = wallet.name;
      connectedAddress = unshieldedAddress;
      window.dispatchEvent(new CustomEvent('proofshield:wallet-connected', {
        detail: { api, address: unshieldedAddress, name: wallet.name, network: 'preprod' },
      }));
      updateButtons(`${wallet.name} connected on Preprod.`);

      try {
        const response = await fetch('/api/wallets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            network: 'preprod',
            walletAddress: unshieldedAddress,
            walletName: wallet.name,
            walletRdns: wallet.rdns ?? walletId,
          }),
        });
        if (response.ok) updateButtons(`${wallet.name} connected and saved to your profile.`);
        else if (response.status !== 401) updateButtons(`${wallet.name} connected; profile save failed.`);
      } catch {
        updateButtons(`${wallet.name} connected; profile service unavailable.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed.';
      updateButtons(message);
      buttons.forEach((item) => { item.title = message; });
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
      if (!connectedApi) buttons.forEach((item) => { item.textContent = 'Connect wallet'; });
    }
  }));
});
