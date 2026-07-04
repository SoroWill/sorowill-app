import { SoroWillClient, type SoroWillNetwork } from '@sorowill/sdk';

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

let cachedClient: SoroWillClient | undefined;

/**
 * Returns a lazily-initialized, module-level singleton `SoroWillClient`
 * configured from `NEXT_PUBLIC_STELLAR_NETWORK` and `NEXT_PUBLIC_CONTRACT_ID`.
 */
export function getSoroWillClient(): SoroWillClient {
  if (!cachedClient) {
    const network = readEnv('NEXT_PUBLIC_STELLAR_NETWORK') as SoroWillNetwork;
    const contractId = readEnv('NEXT_PUBLIC_CONTRACT_ID');
    cachedClient = new SoroWillClient({ network, contractId });
  }
  return cachedClient;
}

/** The Soroban RPC URL configured for this deployment, for display/linking purposes. */
export function getRpcUrl(): string {
  return readEnv('NEXT_PUBLIC_RPC_URL');
}

/** The Stellar network configured for this deployment. */
export function getNetwork(): SoroWillNetwork {
  return readEnv('NEXT_PUBLIC_STELLAR_NETWORK') as SoroWillNetwork;
}

/** The deployed SoroWill contract address configured for this deployment. */
export function getContractId(): string {
  return readEnv('NEXT_PUBLIC_CONTRACT_ID');
}

/** Base URL for viewing addresses/contracts/transactions on Stellar Expert. */
export function stellarExpertUrl(kind: 'contract' | 'account' | 'tx', id: string): string {
  const network = getNetwork();
  return `https://stellar.expert/explorer/${network}/${kind}/${id}`;
}
