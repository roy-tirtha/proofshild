import { auth } from './auth.js';
import { getDb } from './db.js';

const actions = new Set([
  'auction_created',
  'bid_committed',
  'bidding_closed',
  'bid_revealed',
  'winner_declared',
]);

function respond(response, status, body) {
  return response.status(status).json(body);
}

async function currentUser(request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function handleAuctionEvents(request, response) {
  try {
    const user = await currentUser(request);
    if (!user) return respond(response, 401, { error: 'Sign in before saving auction activity.' });

    const collection = getDb().collection('auction_events');
    if (request.method === 'GET') {
      const auctionId = typeof request.query?.auction === 'string' ? request.query.auction : undefined;
      const filter = { userId: user.id, ...(auctionId ? { auctionId } : {}) };
      const events = await collection.find(filter, {
        projection: { _id: 0, contractAddress: 1, auctionId: 1, action: 1, transactionId: 1, walletAddress: 1, network: 1, createdAt: 1 },
      }).sort({ createdAt: -1 }).limit(100).toArray();
      return respond(response, 200, { events });
    }
    if (request.method !== 'POST') return respond(response, 405, { error: 'Method not allowed.' });

    const { contractAddress, auctionId, action, transactionId, walletAddress } = request.body ?? {};
    if (
      typeof contractAddress !== 'string' || !/^[0-9a-f]{64}$/i.test(contractAddress) ||
      typeof auctionId !== 'string' || !/^[0-9a-f]{64}$/i.test(auctionId) ||
      !actions.has(action) ||
      typeof transactionId !== 'string' || transactionId.length < 1 || transactionId.length > 256 ||
      typeof walletAddress !== 'string' || walletAddress.length < 1 || walletAddress.length > 256
    ) {
      return respond(response, 400, { error: 'Contract address, auction ID, action, transaction ID, and connected wallet are required.' });
    }

    const database = getDb();
    const auction = await database.collection('auctions').findOne({ auctionId: auctionId.toLowerCase(), contractAddress: contractAddress.toLowerCase() });
    if (!auction) return respond(response, 404, { error: 'Publish the auction before recording its activity.' });
    const wallet = await database.collection('wallet_links').findOne({ userId: user.id, network: 'preprod', walletAddress });
    if (!wallet) return respond(response, 403, { error: 'Connect this wallet while signed in before recording auction activity.' });

    const event = { contractAddress, auctionId: auctionId.toLowerCase(), action, transactionId, walletAddress, userId: user.id, network: 'preprod', createdAt: new Date() };
    await collection.updateOne(
      { auctionId: event.auctionId, transactionId },
      { $setOnInsert: event },
      { upsert: true },
    );
    return respond(response, 201, { event: { ...event, createdAt: event.createdAt.toISOString() } });
  } catch (error) {
    if (error?.code === 11000) return respond(response, 201, { saved: true });
    console.error('[Auction events] Operation failed:', error?.message);
    return respond(response, 500, { error: 'Auction activity could not be saved.' });
  }
}
