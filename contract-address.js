// Set this once to the address emitted by the singleton contract deployment.
export const CONTRACT_ADDRESS = 'b0bd1feb64dadad51e987f6ba8e08adaa26945b3135b44c014c8f08a56bbae89';

export function requireContractAddress() {
  if (!/^[0-9a-f]{64}$/i.test(CONTRACT_ADDRESS)) {
    throw new Error('The shared auction contract has not been configured. Deploy the multi-auction contract once, then set CONTRACT_ADDRESS in contract-address.js.');
  }
  return CONTRACT_ADDRESS.toLowerCase();
}
