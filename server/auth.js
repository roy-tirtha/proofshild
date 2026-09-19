import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { memoryAdapter } from '@better-auth/memory-adapter';
import dotenv from 'dotenv';
import { connectToDatabase, getDb, getClient, getMongoStatus } from './db.js';

dotenv.config();

// Attempt database connection
const { client, db, isConnected } = await connectToDatabase();

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const hasGoogleConfig = !!(googleClientId && googleClientSecret && !googleClientId.includes('your-google-client-id'));

console.log(`[Better Auth] Initializing authentication system...`);
console.log(`[Better Auth] Database Adapter: ${isConnected ? 'MongoDB Atlas' : 'In-Memory (Awaiting MONGODB_URI)'}`);
console.log(`[Better Auth] Google OAuth: ${hasGoogleConfig ? 'Configured' : 'Pending Credentials'}`);
console.log(`[Better Auth] Email/Password Registration: Enabled`);

const memoryDb = { user: [], session: [], account: [], verification: [] };

export const auth = betterAuth({
  database: isConnected && db ? mongodbAdapter(db, { client }) : memoryAdapter(memoryDb),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'proofshield_secure_better_auth_key_32_chars_min_2026_xyz',
  trustedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientId: googleClientId || 'placeholder-client-id',
      clientSecret: googleClientSecret || 'placeholder-client-secret',
      enabled: hasGoogleConfig,
    },
  },
  user: {
    additionalFields: {
      organization: {
        type: 'string',
        required: false,
        defaultValue: 'Independent Researcher',
      },
    },
  },
});

export function getAuthConfig() {
  return {
    mongo: getMongoStatus(),
    hasGoogleConfig,
    emailPasswordEnabled: true,
  };
}
