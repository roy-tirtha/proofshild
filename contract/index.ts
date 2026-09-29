import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
} from './managed/proofshield/contract/index.js';
import { Contract } from './managed/proofshield/contract/index.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'proofshield');

export const CompiledProofShieldContract = CompiledContract.make(
  'ProofShieldAuction',
  Contract,
).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
