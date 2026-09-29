import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
let client = null;
let db = null;
let isConnected = false;
let connectionError = null;

/**
 * Connects to MongoDB Atlas using the configured connection string.
 */
export async function connectToDatabase() {
  if (db && isConnected) {
    return { client, db, isConnected: true };
  }

  if (!uri || uri.includes('<username>') || uri.includes('<password>')) {
    connectionError = "MONGODB_URI is not set or contains placeholder credentials in .env";
    console.warn(`[MongoDB Atlas] ⚠️  ${connectionError}`);
    return { client: null, db: null, isConnected: false, error: connectionError };
  }

  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    const dbName = process.env.MONGODB_DB_NAME || 'proofshield';
    db = client.db(dbName);
    await db.command({ ping: 1 });
    await ensureApplicationCollections(db);
    isConnected = true;
    connectionError = null;
    console.log(`[MongoDB Atlas] ✅ Connected successfully to cluster database: "${dbName}"`);
    return { client, db, isConnected: true };
  } catch (err) {
    if (client) await client.close().catch(() => undefined);
    client = null;
    db = null;
    isConnected = false;
    connectionError = err.message;
    console.error(`[MongoDB Atlas] ❌ Connection error:`, err.message);
    return { client: null, db: null, isConnected: false, error: err.message };
  }
}

async function ensureApplicationCollections(database) {
  const schemas = [
    {
      name: 'wallet_links',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'network', 'walletAddress', 'walletName', 'walletRdns', 'createdAt', 'updatedAt'],
          properties: {
            userId: { bsonType: 'string', minLength: 1 },
            network: { enum: ['local', 'preview', 'preprod'] },
            walletAddress: { bsonType: 'string', minLength: 1, maxLength: 256 },
            walletName: { bsonType: 'string', minLength: 1, maxLength: 100 },
            walletRdns: { bsonType: 'string', minLength: 1, maxLength: 256 },
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: 'date' },
          },
        },
      },
    },
    {
      name: 'proof_records',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'network', 'contractAddress', 'transactionHash', 'circuit', 'threshold', 'claimVerified', 'createdAt'],
          properties: {
            userId: { bsonType: 'string', minLength: 1 },
            walletAddress: { bsonType: 'string', maxLength: 256 },
            network: { enum: ['local', 'preview', 'preprod'] },
            contractAddress: { bsonType: 'string', minLength: 1, maxLength: 256 },
            transactionHash: { bsonType: 'string', minLength: 1, maxLength: 256 },
            circuit: { enum: ['initialise_claim', 'submit_proof'] },
            threshold: { bsonType: 'string', pattern: '^[0-9]+$' },
            claimVerified: { bsonType: 'bool' },
            createdAt: { bsonType: 'date' },
          },
        },
      },
    },
  ];

  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name));
  for (const schema of schemas) {
    if (!existing.has(schema.name)) {
      await database.createCollection(schema.name, { validator: schema.validator, validationLevel: 'strict' });
    } else {
      await database.command({ collMod: schema.name, validator: schema.validator, validationLevel: 'strict' });
    }
  }

  await database.collection('wallet_links').createIndex(
    { network: 1, walletAddress: 1 },
    { unique: true, name: 'unique_network_wallet' },
  );
  await database.collection('wallet_links').createIndex({ userId: 1, network: 1 }, { name: 'wallets_by_user_network' });
  await database.collection('proof_records').createIndex(
    { network: 1, transactionHash: 1 },
    { unique: true, name: 'unique_network_proof_transaction' },
  );
  await database.collection('proof_records').createIndex({ userId: 1, createdAt: -1 }, { name: 'proofs_by_user_recent' });
}

export function getDb() {
  return db;
}

export function getClient() {
  return client;
}

export function getMongoStatus() {
  return {
    isConnected,
    dbName: process.env.MONGODB_DB_NAME || 'proofshield',
    hasUri: !!uri && !uri.includes('<username>'),
    error: connectionError,
  };
}
