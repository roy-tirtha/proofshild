import { Buffer } from 'buffer/';

globalThis.Buffer ??= Buffer;

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

  window.proofshieldDeployAuction = async () => {
    if (!connectedApi) throw new Error('Connect a Lace or 1AM wallet on Preprod before deploying the shared contract.');
    const { deploySharedContractFromConnectedWallet } = await import('./proof-client.js');
    const address = await deploySharedContractFromConnectedWallet(connectedApi);
    console.info('ProofShield shared contract deployed:', address);
    return address;
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

  const chooseWallet = (wallets) => new Promise((resolve) => {
    if (wallets.length === 1) {
      resolve(wallets[0]);
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'wallet-picker-dialog';
    dialog.setAttribute('aria-labelledby', 'wallet-picker-title');
    const panel = document.createElement('div');
    panel.className = 'wallet-picker-panel';
    const heading = document.createElement('h2');
    heading.id = 'wallet-picker-title';
    heading.textContent = 'Choose a wallet';
    const description = document.createElement('p');
    description.textContent = 'Select which Midnight wallet to connect on Preprod.';
    const options = document.createElement('div');
    options.className = 'wallet-picker-options';
    let selection;

    wallets.forEach(([walletId, wallet]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'wallet-picker-option';
      option.textContent = wallet.name || (/1am/i.test(walletId) ? '1AM Wallet' : 'Midnight Wallet');
      option.addEventListener('click', () => {
        selection = [walletId, wallet];
        dialog.close();
      });
      options.append(option);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'wallet-picker-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dialog.close());
    panel.append(heading, description, options, cancel);
    dialog.append(panel);
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(selection);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });

  if (!document.querySelector('#wallet-picker-styles')) {
    const style = document.createElement('style');
    style.id = 'wallet-picker-styles';
    style.textContent = `
      .wallet-picker-dialog { width: min(420px, calc(100% - 32px)); padding: 0; border: 1px solid #29363a; border-radius: 18px; color: #f3f7f6; background: #10191b; box-shadow: 0 24px 80px #0009; }
      .wallet-picker-dialog::backdrop { background: #050a0bd9; backdrop-filter: blur(5px); }
      .wallet-picker-panel { padding: 28px; font-family: inherit; }
      .wallet-picker-panel h2 { margin: 0 0 8px; font-size: 1.35rem; }
      .wallet-picker-panel p { margin: 0 0 20px; color: #aab8b8; line-height: 1.5; }
      .wallet-picker-options { display: grid; gap: 10px; }
      .wallet-picker-option, .wallet-picker-cancel { min-height: 48px; border-radius: 10px; font: inherit; cursor: pointer; }
      .wallet-picker-option { border: 1px solid #39494b; color: #fff; background: #1a292b; text-align: left; padding: 0 16px; }
      .wallet-picker-option:hover { border-color: #64e3c1; background: #203735; }
      .wallet-picker-cancel { width: 100%; margin-top: 12px; border: 0; color: #aab8b8; background: transparent; }
      .wallet-picker-cancel:hover { color: #fff; }
    `;
    document.head.append(style);
  }

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
      const selectedWallet = await chooseWallet(wallets);
      if (!selectedWallet) {
        updateButtons('Wallet connection cancelled.');
        return;
      }
      const [walletId, wallet] = selectedWallet;
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
