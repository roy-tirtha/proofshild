import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'contract/managed/proofshield');
const destination = path.join(root, 'public/contract/managed/proofshield');

await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log('Published ProofShield proving keys and zkIR to public/contract/managed/proofshield');
