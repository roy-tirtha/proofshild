import { ObjectId } from 'mongodb';
import { auth } from './auth.js';
import { getDb } from './db.js';

const supportedNetworks = new Set(['local', 'preview', 'preprod']);

async function currentUser(request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

function respond(response, status, body) {
  return response.status(status).json(body);
}

export async function handleWalletRecords(request, response) {
  try {
    const user = await currentUser(request);
    if (!user) return respond(response, 401, { error: 'Sign in before linking a wallet.' });

    const collection = getDb().collection('wallet_links');
    if (request.method === 'GET') {
      const wallets = await collection.find({ userId: user.id }).sort({ updatedAt: -1 }).toArray();
      return respond(response, 200, { wallets });
    }
    if (request.method !== 'POST') return respond(response, 405, { error: 'Method not allowed.' });

    const { network, walletAddress, walletName, walletRdns } = request.body ?? {};
    if (
      !supportedNetworks.has(network) ||
      typeof walletAddress !== 'string' || walletAddress.length < 1 || walletAddress.length > 256 ||
      typeof walletName !== 'string' || walletName.length < 1 || walletName.length > 100 ||
      typeof walletRdns !== 'string' || walletRdns.length < 1 || walletRdns.length > 256
    ) {
      return respond(response, 400, { error: 'Wallet network, address, name, and identifier are required.' });
    }

    const now = new Date();
    const result = await collection.findOneAndUpdate(
      { userId: user.id, network, walletAddress },
      {
        $set: { walletName, walletRdns, updatedAt: now },
        $setOnInsert: { userId: user.id, network, walletAddress, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return respond(response, 200, { wallet: result });
  } catch (error) {
    if (error?.code === 11000) return respond(response, 409, { error: 'This wallet is already linked to another account on this network.' });
    console.error('[Records] Wallet operation failed:', error?.message);
    return respond(response, 500, { error: 'Wallet record could not be saved.' });
  }
}

export async function handleProofRecords(request, response) {
  try {
    const user = await currentUser(request);
    if (!user) return respond(response, 401, { error: 'Sign in before saving proof records.' });

    const collection = getDb().collection('proof_records');
    if (request.method === 'GET') {
      const proofs = await collection.find({ userId: user.id }).sort({ createdAt: -1 }).limit(100).toArray();
      return respond(response, 200, { proofs });
    }
    if (request.method !== 'POST') return respond(response, 405, { error: 'Method not allowed.' });

    const {
      network, walletAddress, contractAddress, transactionHash, circuit, threshold, claimVerified,
    } = request.body ?? {};
    if (
      !supportedNetworks.has(network) ||
      typeof contractAddress !== 'string' || contractAddress.length < 1 || contractAddress.length > 256 ||
      typeof transactionHash !== 'string' || transactionHash.length < 1 || transactionHash.length > 256 ||
      !['initialise_claim', 'submit_proof'].includes(circuit) ||
      typeof threshold !== 'string' || !/^\d{1,20}$/.test(threshold) ||
      typeof claimVerified !== 'boolean' ||
      (walletAddress !== undefined && (typeof walletAddress !== 'string' || walletAddress.length > 256))
    ) {
      return respond(response, 400, { error: 'Only public transaction metadata and public claim state can be stored.' });
    }

    const record = {
      userId: user.id,
      network,
      contractAddress,
      transactionHash,
      circuit,
      threshold,
      claimVerified,
      createdAt: new Date(),
      ...(walletAddress ? { walletAddress } : {}),
    };
    const result = await collection.insertOne(record);
    return respond(response, 201, { proof: { ...record, _id: result.insertedId } });
  } catch (error) {
    if (error?.code === 11000) return respond(response, 409, { error: 'This transaction is already recorded.' });
    console.error('[Records] Proof operation failed:', error?.message);
    return respond(response, 500, { error: 'Proof record could not be saved.' });
  }
}

export async function handleDeleteWallet(request, response) {
  try {
    const user = await currentUser(request);
    if (!user) return respond(response, 401, { error: 'Sign in before unlinking a wallet.' });
    const walletId = request.params?.id ?? request.query?.id ?? new URL(request.url, 'http://localhost').searchParams.get('id');
    if (!ObjectId.isValid(walletId)) return respond(response, 400, { error: 'Valid wallet record id is required.' });
    const result = await getDb().collection('wallet_links').deleteOne({ _id: new ObjectId(walletId), userId: user.id });
    return respond(response, result.deletedCount ? 200 : 404, { deleted: Boolean(result.deletedCount) });
  } catch (error) {
    console.error('[Records] Wallet deletion failed:', error?.message);
    return respond(response, 500, { error: 'Wallet record could not be deleted.' });
  }
}
