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
    isConnected = true;
    connectionError = null;
    console.log(`[MongoDB Atlas] ✅ Connected successfully to cluster database: "${dbName}"`);
    return { client, db, isConnected: true };
  } catch (err) {
    isConnected = false;
    connectionError = err.message;
    console.error(`[MongoDB Atlas] ❌ Connection error:`, err.message);
    return { client: null, db: null, isConnected: false, error: err.message };
  }
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
