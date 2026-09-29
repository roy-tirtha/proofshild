import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { toNodeHandler } from 'better-auth/node';
import { auth, getAuthConfig } from './auth.js';
import { handleDeleteWallet, handleProofRecords, handleWalletRecords } from './records.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for localhost and frontend origins
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  credentials: true,
}));

// Mount Better Auth handler (NOTE: Must be placed BEFORE express.json())
app.all('/api/auth/*splat', toNodeHandler(auth));

// Body parsers for custom API routes AFTER auth handler
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.all('/api/wallets', handleWalletRecords);
app.all('/api/wallets/:id', handleDeleteWallet);
app.all('/api/proofs', handleProofRecords);

// System telemetry and auth status endpoint
app.get('/api/system/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    auth: getAuthConfig(),
  });
});

// Serve static assets from project root
app.use(express.static(rootDir, {
  extensions: ['html'],
}));

// Catch-all fallback to serve index.html for client-side navigation
app.use((req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🛡️  ProofShield Production & Auth Server`);
  console.log(`  🚀  Listening at: http://localhost:${PORT}`);
  console.log(`  🔐  Better Auth:  http://localhost:${PORT}/api/auth`);
  console.log(`  📊  Status API:   http://localhost:${PORT}/api/system/status`);
  console.log(`======================================================\n`);
});
