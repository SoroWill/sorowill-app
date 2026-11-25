import { SoroWillClient, type SoroWillNetwork, type Will } from '@sorowill/sdk';
import { isWillNotFoundError } from '@/lib/errors';
import { getNetwork } from '@/lib/network';

// Kept as a re-export for existing callers; the implementation lives in
// '@/lib/network' so UI code can read the network without this module.
export { getNetwork } from '@/lib/network';

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

let cachedClient: SoroWillClient | undefined;
let cachedNetwork: SoroWillNetwork | undefined;

export function resetSoroWillClient(): void {
  cachedClient = undefined;
  cachedNetwork = undefined;
}

/**
 * Resolves the SoroWill contract address for an explicit network.
 *
 * Mainnet is strict: it requires `NEXT_PUBLIC_CONTRACT_ID_MAINNET` and will
 * NOT fall back to the generic `NEXT_PUBLIC_CONTRACT_ID`, because that
 * variable is typically set to a testnet contract on single-contract
 * deployments. Silently reusing it on mainnet would point calls at a
 * nonexistent or unrelated contract (see issue #345).
 *
 * Testnet prefers `NEXT_PUBLIC_CONTRACT_ID_TESTNET` but keeps the generic
 * `NEXT_PUBLIC_CONTRACT_ID` as a backward-compatible fallback for existing
 * testnet-only deployments.
 */
function getContractIdForNetwork(network: SoroWillNetwork): string {
  let contractId: string | undefined;

  if (network === 'mainnet') {
    // Mainnet is strict: never silently fall back to the generic
    // NEXT_PUBLIC_CONTRACT_ID, which is almost certainly a testnet address.
    // A testnet address sent against mainnet either points at a nonexistent
    // contract or — worse — a completely different contract that happens to
    // share the same ID. Require an explicit mainnet-specific variable so
    // the misconfiguration is caught at startup rather than at sign time.
    contractId = process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET || '';
    if (!contractId) {
      throw new Error(
        'Missing required environment variable: NEXT_PUBLIC_CONTRACT_ID_MAINNET. ' +
          'Set it to the SoroWill contract address deployed on Stellar mainnet. ' +
          'Do not reuse a testnet address — it will point at the wrong (or nonexistent) contract.',
      );
    }
  } else {
    // Testnet allows the legacy generic fallback for local/preview deployments
    // that only set NEXT_PUBLIC_CONTRACT_ID.
    contractId = process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET || process.env.NEXT_PUBLIC_CONTRACT_ID || '';
    if (!contractId) {
      throw new Error(
        'Missing required environment variable: NEXT_PUBLIC_CONTRACT_ID_TESTNET (or NEXT_PUBLIC_CONTRACT_ID). ' +
          'Copy .env.example to .env.local and fill it in.',
      );
    }
  }

  validateContractId(contractId);
  return contractId;
}

/** The deployed SoroWill contract address for the active network. */
export function getContractId(): string {
  return getContractIdForNetwork(getNetwork());
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
 * Optional dependency-injection context for {@link getSoroWillClient}.
 * Lets tests (or callers) supply a client without touching module state.
 */
export interface SoroWillClientContext {
  /** Use this client instead of the module-level singleton. */
  client?: SoroWillClient;
}

/**
 * Returns a lazily-initialized, module-level singleton `SoroWillClient`
 * configured from the active network. Pass `context.client` to bypass the
 * singleton entirely (e.g. inject a fake in unit tests).
 */
export function getSoroWillClient(context?: SoroWillClientContext): SoroWillClient {
  if (context?.client) return context.client;
  const network = getNetwork();
  const contractId = getContractId();
  if (!cachedClient || cachedNetwork !== network) {
    cachedClient = new SoroWillClient({ network, contractId });
    cachedNetwork = network;
  }
  return cachedClient;
}

/** Returns the Stellar Expert network path segment ('public' for mainnet, 'testnet' for testnet). */
export function getExplorerNetworkSegment(network: SoroWillNetwork): string {
  return network === 'mainnet' ? 'public' : 'testnet';
}

/** Base URL for viewing addresses/contracts/transactions on Stellar Expert. */
export function stellarExpertUrl(kind: 'contract' | 'account' | 'tx', id: string): string {
  const network = getNetwork();
  const segment = getExplorerNetworkSegment(network);
  return `https://stellar.expert/explorer/${segment}/${kind}/${id}`;
}

export interface WillsScanResult {
  wills: Will[];
  /** True if any scan errors occurred that were not simply "will not found" (e.g. RPC/network failures). */
  hasErrors: boolean;
}

/** @deprecated Use {@link WillsScanResult}; kept for existing imports. */
export type GuardianWillsResult = WillsScanResult;

/** @deprecated Use {@link getWillsByBeneficiary}; kept for existing imports. */
export type BeneficiaryWillsResult = WillsScanResult;

const SCAN_BATCH_SIZE = 30;
const SCAN_MAX_ID = 1000;

/**
 * Scans will IDs in expanding batches, returning every will that `matches`
 * accepts, and stopping once an entire batch turns up no wills. Expanding
 * batches avoid capping the scan at a fixed constant while still bounding the
 * total work performed.
 */
async function scanWills(
  matches: (will: Will) => boolean,
  context?: SoroWillClientContext,
  signal?: AbortSignal,
): Promise<WillsScanResult> {
  const client = getSoroWillClient(context);
  const wills: Will[] = [];
  let hasErrors = false;

  for (let batchStart = 1; batchStart <= SCAN_MAX_ID; batchStart += SCAN_BATCH_SIZE) {
    // Stop scanning once the caller has gone away instead of issuing up to
    // SCAN_MAX_ID more RPC calls nobody will read.
    signal?.throwIfAborted();
    const batchEnd = Math.min(batchStart + SCAN_BATCH_SIZE - 1, SCAN_MAX_ID);
    let foundAnyInBatch = false;

    const ids = Array.from({ length: batchEnd - batchStart + 1 }, (_, offset) => batchStart + offset);
    await Promise.all(
      ids.map((id) =>
        client
          .getWill(id.toString())
          .then((will) => {
            foundAnyInBatch = true;
            if (will && matches(will)) {
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

/** Fetches every will in which `guardianAddress` is listed as a guardian. */
export function getWillsByGuardian(
  guardianAddress: string,
  context?: SoroWillClientContext,
  signal?: AbortSignal,
): Promise<WillsScanResult> {
  const needle = guardianAddress.trim().toUpperCase();
  return scanWills((will) =>
    (will.guardians ?? []).some((guardian) => guardian.trim().toUpperCase() === needle),
    context,
    signal,
  );
}

/**
 * Fetches every will that names `beneficiaryAddress` as a beneficiary, so a
 * beneficiary can find the wills they are entitled to without knowing the
 * will IDs (issue #876). Addresses are Stellar accounts, so the comparison is
 * case-insensitive (the contract stores them uppercase).
 */
export function getWillsByBeneficiary(
  beneficiaryAddress: string,
  context?: SoroWillClientContext,
  signal?: AbortSignal,
): Promise<WillsScanResult> {
  const needle = beneficiaryAddress.trim().toUpperCase();
  return scanWills(
    (will) =>
      (will.beneficiaries ?? []).some(
        (beneficiary) => beneficiary.address.trim().toUpperCase() === needle,
      ),
    context,
    signal,
  );
}

const ENUMERATE_BATCH_SIZE = 30;
const ENUMERATE_MAX_ID = 1000;

/**
 * Fetches every will on the contract by scanning sequential will IDs in
 * expanding batches, stopping once an entire batch turns up no wills. Used
 * as a fallback when the contract doesn't expose an aggregate stats query
 * (see StatsContent).
 */
export async function enumerateAllWills(context?: SoroWillClientContext): Promise<Will[]> {
  const client = getSoroWillClient(context);
  const wills: Will[] = [];

  for (let batchStart = 1; batchStart <= ENUMERATE_MAX_ID; batchStart += ENUMERATE_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + ENUMERATE_BATCH_SIZE - 1, ENUMERATE_MAX_ID);
    let foundAnyInBatch = false;

    const ids = Array.from({ length: batchEnd - batchStart + 1 }, (_, offset) => batchStart + offset);
    await Promise.all(
      ids.map((id) =>
        client
          .getWill(id.toString())
          .then((will) => {
            foundAnyInBatch = true;
            if (will) {
              wills.push(will);
            }
          })
          .catch((error) => {
            if (!isWillNotFoundError(error)) {
              throw error;
            }
          })
      )
    );

    if (!foundAnyInBatch) {
      break;
    }
  }

  return wills;
}


// The Soroban contract supports a maximum of 3 guardians per will.
// @sorowill/sdk does not export this constant, so we define it here.
export const MAX_GUARDIANS = 3;

export const GUARDIAN_THRESHOLD = 2;
