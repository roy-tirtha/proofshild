const list = document.getElementById('catalogue-list');
const status = document.getElementById('catalogue-status');
const shorten = (value) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const phaseName = (phase) => ['Not started', 'Bidding open', 'Reveal open', 'Finished'][Number(phase)] || 'Unknown';

async function readApiJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(`Auction API returned HTML instead of JSON (HTTP ${response.status}). Open the local app at http://localhost:3000, or redeploy the latest Vercel commit.`);
  return response.json();
}

function cardFor(auction, state) {
  const article = document.createElement('article');
  article.className = 'catalogue-card';
  const heading = document.createElement('h3'); heading.textContent = auction.title;
  const creator = document.createElement('p'); creator.textContent = `Created by ${shorten(auction.creatorWallet)}`;
  const metrics = document.createElement('div'); metrics.className = 'catalogue-metrics';
  metrics.textContent = `Preprod · ${phaseName(state.phase)} · Reserve ${state.reserve} · ${state.sealedCount} sealed · ${state.revealedCount} revealed`;
  const identifier = document.createElement('code'); identifier.textContent = `Auction ID: ${auction.auctionId}`;
  const link = document.createElement('a'); link.className = 'catalogue-link';
  link.href = `${Number(state.phase) >= 2 ? 'auction-results.html' : 'auction.html'}?auction=${encodeURIComponent(auction.auctionId)}`;
  link.textContent = Number(state.phase) >= 2 ? 'Open results' : 'Place sealed bid';
  article.append(heading, creator, metrics, identifier, link);
  return article;
}

async function loadCatalogue() {
  try {
    const response = await fetch('/api/auctions', { credentials: 'include' });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || 'Could not load the auction catalogue.');
    if (!payload.auctions.length) { status.textContent = 'No auctions are registered yet. Create the first auction in the shared contract.'; return; }
    const { readPreprodAuction } = await import('./proof-client.js');
    const cards = await Promise.all(payload.auctions.map(async (auction) => {
      try { return cardFor(auction, await readPreprodAuction(auction.auctionId)); }
      catch (error) {
        const card = document.createElement('article'); card.className = 'catalogue-card';
        const title = document.createElement('h3'); title.textContent = auction.title;
        const detail = document.createElement('p'); detail.textContent = `On-chain state unavailable: ${error.message}`;
        card.append(title, detail); return card;
      }
    }));
    list.replaceChildren(...cards);
    status.textContent = `${payload.auctions.length} auction${payload.auctions.length === 1 ? '' : 's'} registered · all actions use one shared Preprod contract`;
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Auction catalogue unavailable.'; }
}

loadCatalogue();
