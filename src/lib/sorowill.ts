import { SoroWillClient, type SoroWillNetwork, type Will } from '@sorowill/sdk';

function validateStellarNetwork(value: string): SoroWillNetwork {
  if (value !== 'testnet' && value !== 'mainnet') {
    throw new Error(
      `Invalid NEXT_PUBLIC_STELLAR_NETWORK: "${value}". Must be exactly 'testnet' or 'mainnet'.`,
    );
  }
  return value;
}

function validateContractId(value: string): void {
  if (!/^C[A-Z2-7]{55}$/.test(value)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_CONTRACT_ID: "${value}". Must be a valid Stellar contract address (starts with 'C' followed by 55 base32 characters).`,
    );
  }
}

function validateRpcUrl(value: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_RPC_URL: "${value}". Must be a valid URL.`,
    );
  }
}

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

let cachedClient: SoroWillClient | undefined;
let cachedNetwork: SoroWillNetwork | undefined;

export function resetSoroWillClient(): void {
  cachedClient = undefined;
  cachedNetwork = undefined;
}

/** The Stellar network configured for this deployment. */
export function getNetwork(): SoroWillNetwork {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('sorowill_network');
    if (stored === 'testnet' || stored === 'mainnet') {
      return stored as SoroWillNetwork;
    }
  }
  const value = readEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
  return validateStellarNetwork(value);
}

/** The deployed SoroWill contract address configured for this deployment. */
export function getContractId(): string {
  const network = getNetwork();
  let contractId: string;
  if (network === 'mainnet') {
    contractId = process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET || process.env.NEXT_PUBLIC_CONTRACT_ID || '';
  } else {
    contractId = process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET || process.env.NEXT_PUBLIC_CONTRACT_ID || '';
  }
  if (!contractId) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_CONTRACT_ID (or NEXT_PUBLIC_CONTRACT_ID_MAINNET/NEXT_PUBLIC_CONTRACT_ID_TESTNET). Copy .env.example to .env.local and fill it in.',
    );
  }
  validateContractId(contractId);
  return contractId;
}

/** The Soroban RPC URL configured for this deployment, for display/linking purposes. */
export function getRpcUrl(): string {
  const network = getNetwork();
  let rpcUrl: string;
  if (network === 'mainnet') {
    rpcUrl = process.env.NEXT_PUBLIC_RPC_URL_MAINNET || 'https://soroban-mainnet.stellar.org';
  } else {
    rpcUrl = process.env.NEXT_PUBLIC_RPC_URL_TESTNET || process.env.NEXT_PUBLIC_RPC_URL || 'https://soroban-testnet.stellar.org';
  }
  validateRpcUrl(rpcUrl);
  return rpcUrl;
}

/**
 * Returns a lazily-initialized, module-level singleton `SoroWillClient`
 * configured from the active network.
 */
export function getSoroWillClient(): SoroWillClient {
  const network = getNetwork();
  const contractId = getContractId();
  if (!cachedClient || cachedNetwork !== network) {
    cachedClient = new SoroWillClient({ network, contractId });
    cachedNetwork = network;
  }
  return cachedClient;
}

/** Base URL for viewing addresses/contracts/transactions on Stellar Expert. */
export function stellarExpertUrl(kind: 'contract' | 'account' | 'tx', id: string): string {
  const network = getNetwork();
  return `https://stellar.expert/explorer/${network}/${kind}/${id}`;
}

export interface GuardianWillsResult {
  wills: Will[];
  /** True if any scan errors occurred that were not simply "will not found" (e.g. RPC/network failures). */
  hasErrors: boolean;
}

const GUARDIAN_SCAN_BATCH_SIZE = 30;
const GUARDIAN_SCAN_MAX_ID = 1000;

/**
 * Best-effort heuristic distinguishing "this will ID doesn't exist" (expected
 * once we scan past the last assigned ID) from other failures such as a
 * transient RPC/network error.
 */
function isWillNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /not\s*found|missing|does not exist|no such/i.test(error.message);
}

/**
 * Fetches wills by guardian by scanning will IDs in expanding batches,
 * stopping once an entire batch turns up no wills. This avoids capping the
 * scan at a fixed constant while still bounding the total work performed.
 */
export async function getWillsByGuardian(guardianAddress: string): Promise<GuardianWillsResult> {
  const client = getSoroWillClient();
  const wills: Will[] = [];
  let hasErrors = false;

  for (let batchStart = 1; batchStart <= GUARDIAN_SCAN_MAX_ID; batchStart += GUARDIAN_SCAN_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + GUARDIAN_SCAN_BATCH_SIZE - 1, GUARDIAN_SCAN_MAX_ID);
    let foundAnyInBatch = false;

    const ids = Array.from({ length: batchEnd - batchStart + 1 }, (_, offset) => batchStart + offset);
    await Promise.all(
      ids.map((id) =>
        client
          .getWill(id.toString())
          .then((will) => {
            foundAnyInBatch = true;
            if (will && will.guardians && will.guardians.includes(guardianAddress)) {
              wills.push(will);
            }
          })
          .catch((error) => {
            if (!isWillNotFoundError(error)) {
              hasErrors = true;
            }
          })
      )
    );

    if (!foundAnyInBatch) {
      break;
    }
  }

  return { wills, hasErrors };
}


