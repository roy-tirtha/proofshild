const list = document.getElementById('catalogue-list');
const status = document.getElementById('catalogue-status');
const shorten = (value) => `${value.slice(0, 10)}…${value.slice(-8)}`;

async function readApiJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`The auction API route returned HTML rather than JSON (HTTP ${response.status}). Open the local app at http://localhost:3000, or redeploy the current Vercel commit containing api/auctions.js.`);
  }
  return response.json();
}

function cardFor(auction, state) {
  const article = document.createElement('article');
  article.className = 'catalogue-card';
  const heading = document.createElement('h3');
  heading.textContent = auction.title;
  const creator = document.createElement('p');
  creator.textContent = `Created by ${shorten(auction.creatorWallet)}`;
  const metrics = document.createElement('div');
  metrics.className = 'catalogue-metrics';
  const phase = ['Not started', 'Bidding open', 'Reveal open', 'Finished'][Number(state.phase)] || 'Unknown';
  metrics.textContent = `Preprod · ${phase} · Reserve ${state.reserve_price} · ${state.commitments.size()} sealed · ${state.reveal_count} revealed`;
  const address = document.createElement('code');
  address.textContent = auction.contractAddress;
  const link = document.createElement('a');
  link.className = 'catalogue-link';
  const destination = Number(state.phase) >= 2 ? 'auction-results.html' : 'auction.html';
  link.href = `${destination}?contract=${encodeURIComponent(auction.contractAddress)}&title=${encodeURIComponent(auction.title)}`;
  link.textContent = Number(state.phase) >= 2 ? 'Open auction & results' : 'Open auction & bid';
  link.style.padding = '0 16px';
  article.append(heading, creator, metrics, address, link);
  return article;
}

async function loadCatalogue() {
  try {
    const response = await fetch('/api/auctions', { credentials: 'include' });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || 'Could not load the auction catalogue.');
    if (!payload.auctions.length) {
      status.textContent = 'No auctions are registered yet. Create and publish the first one.';
      return;
    }
    const { readPreprodAuctionState } = await import('./proof-client.js');
    const results = await Promise.all(payload.auctions.map(async (auction) => {
      try { return cardFor(auction, await readPreprodAuctionState(auction.contractAddress)); }
      catch (error) {
        const item = document.createElement('article');
        item.className = 'catalogue-card';
        const title = document.createElement('h2');
        title.textContent = auction.title;
        const reason = document.createElement('p');
        reason.textContent = `Live Preprod state could not be verified: ${error.message}`;
        const address = document.createElement('code');
        address.textContent = auction.contractAddress;
        item.append(title, reason, address);
        return item;
      }
    }));
    list.replaceChildren(...results);
    status.textContent = `${payload.auctions.length} registered auction${payload.auctions.length === 1 ? '' : 's'} · state fetched from Preprod`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Auction catalogue unavailable.';
  }
}

loadCatalogue();
