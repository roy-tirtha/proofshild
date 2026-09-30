import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import dotenv from 'dotenv';
import { connectToDatabase, getMongoStatus } from './db.js';

dotenv.config();

// Attempt database connection
const { client, db, isConnected } = await connectToDatabase();
if (!isConnected || !db) {
  throw new Error('MongoDB Atlas is required for authentication and user data persistence. Check MONGODB_URI and network access.');
}

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const hasGoogleConfig = !!(googleClientId && googleClientSecret && !googleClientId.includes('your-google-client-id'));
const configuredAuthURL = process.env.BETTER_AUTH_URL;
const productionAuthURL = configuredAuthURL?.startsWith('https://')
  ? configuredAuthURL
  : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'proofshild.vercel.app'}`;
const authBaseURL = process.env.NODE_ENV === 'production'
  ? productionAuthURL
  : 'http://localhost:3000';
const authSecret = process.env.BETTER_AUTH_SECRET;
if (process.env.NODE_ENV === 'production' && (!authSecret || authSecret.length < 32)) {
  throw new Error('Set BETTER_AUTH_SECRET to a random value of at least 32 characters in production.');
}

console.log(`[Better Auth] Initializing authentication system...`);
console.log(`[Better Auth] Database Adapter: MongoDB Atlas`);
console.log(`[Better Auth] Google OAuth: ${hasGoogleConfig ? 'Configured' : 'Pending Credentials'}`);
console.log(`[Better Auth] Base URL: ${authBaseURL}`);
console.log(`[Better Auth] Email/Password Registration: Enabled`);

const trustedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://proofshild.vercel.app',
  ...(process.env.AUTH_TRUSTED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
];

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  baseURL: authBaseURL,
  secret: authSecret || 'proofshield-local-development-secret-only-32-chars',
  trustedOrigins,
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
      },
    },
  },
});

export function getAuthConfig() {
  const mongoStatus = getMongoStatus();
  return {
    mongo: {
      isConnected: mongoStatus.isConnected,
      dbName: mongoStatus.dbName,
      hasUri: mongoStatus.hasUri,
    },
    hasGoogleConfig,
    emailPasswordEnabled: true,
  };
}
