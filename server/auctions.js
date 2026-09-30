import { auth } from './auth.js';
import { getDb } from './db.js';
import { CONTRACT_ADDRESS } from '../contract-address.js';

function respond(response, status, body) { return response.status(status).json(body); }
function validAuctionId(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value); }

export async function handleAuctions(request, response) {
  try {
    const collection = getDb().collection('auctions');
    if (request.method === 'GET') {
      if (!validAuctionId(CONTRACT_ADDRESS)) return respond(response, 200, { contractAddress: null, auctions: [], configurationRequired: true });
      const auctions = await collection.find({ contractAddress: CONTRACT_ADDRESS.toLowerCase(), auctionId: { $type: 'string' } }, { projection: { _id: 0, auctionId: 1, contractAddress: 1, title: 1, creatorWallet: 1, createdAt: 1, network: 1 } }).sort({ createdAt: -1 }).limit(100).toArray();
      return respond(response, 200, { contractAddress: CONTRACT_ADDRESS, auctions });
    }
    if (request.method !== 'POST') return respond(response, 405, { error: 'Method not allowed.' });
    if (!validAuctionId(CONTRACT_ADDRESS)) return respond(response, 503, { error: 'The shared Midnight contract is not configured.' });
    const user = await auth.api.getSession({ headers: request.headers }).then((session) => session?.user);
    if (!user) return respond(response, 401, { error: 'Sign in before publishing an auction.' });
    const { auctionId, title, creatorWallet, transactionId } = request.body ?? {};
    const invalidFields = [];
    if (!validAuctionId(auctionId)) invalidFields.push('auctionId must be 64 hexadecimal characters');
    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 100) invalidFields.push('title must contain 1–100 characters');
    if (typeof creatorWallet !== 'string' || creatorWallet.trim().length < 1 || creatorWallet.length > 256) invalidFields.push('creatorWallet must contain 1–256 characters');
    if (typeof transactionId !== 'string' || transactionId.length < 1 || transactionId.length > 256) invalidFields.push('transactionId must contain 1–256 characters');
    if (invalidFields.length) return respond(response, 400, { error: `Invalid auction entry: ${invalidFields.join('; ')}.` });
    const existing = await collection.findOne({ auctionId: auctionId.toLowerCase() });
    if (existing && existing.creatorUserId !== user.id) return respond(response, 409, { error: 'This auction ID is already listed by another account.' });
    const auction = { auctionId: auctionId.toLowerCase(), contractAddress: CONTRACT_ADDRESS.toLowerCase(), title: title.trim(), creatorWallet: creatorWallet.trim(), creatorUserId: user.id, createTransactionId: transactionId, network: 'preprod', createdAt: existing?.createdAt ?? new Date() };
    await collection.replaceOne({ auctionId: auction.auctionId }, auction, { upsert: true });
    return respond(response, 201, { auction: { auctionId: auction.auctionId, contractAddress: auction.contractAddress, title: auction.title, creatorWallet: auction.creatorWallet, createdAt: auction.createdAt, network: auction.network } });
  } catch (error) {
    console.error('[Auctions] Catalogue operation failed:', error?.message);
    return respond(response, 500, { error: 'Auction catalogue is currently unavailable.' });
  }
}
