import { auth } from './auth.js';
import { getDb } from './db.js';

function respond(response, status, body) {
  return response.status(status).json(body);
}

export async function handleAuctions(request, response) {
  try {
    const collection = getDb().collection('auctions');
    if (request.method === 'GET') {
      const auctions = await collection.find({}, {
        projection: { _id: 0, contractAddress: 1, title: 1, creatorWallet: 1, createdAt: 1, network: 1 },
      }).sort({ createdAt: -1 }).limit(100).toArray();
      return respond(response, 200, { auctions });
    }
    if (request.method !== 'POST') return respond(response, 405, { error: 'Method not allowed.' });

    const user = await auth.api.getSession({ headers: request.headers }).then((session) => session?.user);
    if (!user) return respond(response, 401, { error: 'Sign in before publishing an auction.' });

    const { contractAddress, title, creatorWallet } = request.body ?? {};
    if (
      typeof contractAddress !== 'string' || !/^[0-9a-f]{64}$/i.test(contractAddress) ||
      typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 100 ||
      typeof creatorWallet !== 'string' || creatorWallet.trim().length < 1 || creatorWallet.length > 256
    ) {
      return respond(response, 400, { error: 'A valid Preprod contract address, title, and connected creator wallet are required.' });
    }

    const existing = await collection.findOne({ contractAddress });
    if (existing && existing.creatorUserId !== user.id) {
      return respond(response, 409, { error: 'This contract is already listed by another account.' });
    }
    const auction = {
      contractAddress,
      title: title.trim(),
      creatorWallet: creatorWallet.trim(),
      creatorUserId: user.id,
      network: 'preprod',
      createdAt: existing?.createdAt ?? new Date(),
    };
    await collection.replaceOne({ contractAddress }, auction, { upsert: true });
    return respond(response, 201, { auction: { contractAddress, title: auction.title, creatorWallet: auction.creatorWallet, createdAt: auction.createdAt, network: auction.network } });
  } catch (error) {
    console.error('[Auctions] Catalogue operation failed:', error?.message);
    return respond(response, 500, { error: 'Auction catalogue is currently unavailable.' });
  }
}
