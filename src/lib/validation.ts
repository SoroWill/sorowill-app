import { normalizeWalletNetwork } from "@/lib/freighter";

/**
 * The networks SoroWill supports. Kept as a string union so callers can pass
 * either the app's configured network or a raw wallet network value.
 */
export type SoroWillNetwork = "PUBLIC" | "TESTNET" | "FUTURENET" | "STANDALONE";

export interface NetworkMismatchResult {
  mismatched: boolean;
  connectedNetwork: string | null;
  expectedNetwork: SoroWillNetwork;
}

/**
 * Normalizes an arbitrary wallet network value into a canonical network name.
 * Returns null when the value cannot be resolved to a known network.
 */
function normalizeToKnownNetwork(
  network: string | null | undefined
): SoroWillNetwork | null {
  if (!network) {
    return null;
  }

  const normalized = normalizeWalletNetwork(network);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  switch (upper) {
    case "PUBLIC":
    case "MAINNET":
    case "PUBLIC_NETWORK":
      return "PUBLIC";
    case "TESTNET":
    case "TEST_NETWORK":
      return "TESTNET";
    case "FUTURENET":
    case "FUTURE_NETWORK":
      return "FUTURENET";
    case "STANDALONE":
    case "STANDALONE_NETWORK":
      return "STANDALONE";
    default:
      return null;
  }
}

/**
 * Determines whether the connected wallet network matches the expected app
 * network. A mismatch is reported when no wallet network is available or when
 * the wallet network differs from the expected network.
 */
export function getNetworkMismatch(
  connectedNetwork: string | null | undefined,
  expectedNetwork: SoroWillNetwork
): NetworkMismatchResult {
  const normalizedConnected = normalizeToKnownNetwork(connectedNetwork);
  const normalizedExpected = normalizeToKnownNetwork(expectedNetwork) ?? expectedNetwork;

  const mismatched =
    normalizedConnected === null || normalizedConnected !== normalizedExpected;

  return {
    mismatched,
    connectedNetwork: normalizedConnected,
    expectedNetwork: normalizedExpected,
  };
}

/**
 * Convenience predicate so submit buttons can gate on network mismatch.
 */
export function isTransactionBlockedByNetworkMismatch(
  connectedNetwork: string | null | undefined,
  expectedNetwork: SoroWillNetwork
): boolean {
  return getNetworkMismatch(connectedNetwork, expectedNetwork).mismatched;
}

/**
 * Returns a clear, user-facing message describing the network mismatch and
 * suggesting the user switch their Freighter wallet to the expected network.
 */
export function getNetworkMismatchMessage(
  connectedNetwork: string | null | undefined,
  expectedNetwork: SoroWillNetwork
): string {
  const { mismatched, connectedNetwork: normalizedConnected, expectedNetwork: normalizedExpected } =
    getNetworkMismatch(connectedNetwork, expectedNetwork);

  if (!mismatched) {
    return "";
  }

  if (!normalizedConnected) {
    return `We couldn't detect your Freighter wallet network. Please connect your wallet and switch it to the ${normalizedExpected} network to continue.`;
  }

  return `Your Freighter wallet is connected to the ${normalizedConnected} network, but SoroWill requires the ${normalizedExpected} network. Please switch your Freighter wallet to the ${normalizedExpected} network to continue.`;
}

export interface DetectedNetworkMismatch {
  /** The network the app is configured for (e.g. `testnet`). */
  appNetwork: string;
  /** The network the wallet reported. */
  walletNetwork: string;
}

/**
 * Compares the app's configured network with the one the wallet reports, for
 * the mismatch banner. Returns `null` when the wallet network is unknown (so a
 * disconnected wallet does not raise a banner) or when they agree.
 *
 * `appNetwork` accepts both the app's own values (`testnet`/`mainnet`) and the
 * canonical names (`TESTNET`/`PUBLIC`).
 */
/**
 * Canonicalises a network name for comparison. Unknown names are returned
 * uppercased rather than discarded, so the banner can still name a wallet on a
 * network this app does not know about (e.g. `FUTURENET`).
 */
function canonicalNetwork(network: string): string {
  switch (network.trim().toUpperCase()) {
    case "PUBLIC":
    case "MAINNET":
    case "PUBLIC_NETWORK":
      return "PUBLIC";
    case "TESTNET":
    case "TEST_NETWORK":
      return "TESTNET";
    default:
      return network.trim().toUpperCase();
  }
}

export function detectNetworkMismatch(
  appNetwork: string,
  walletNetwork: string | null | undefined,
): DetectedNetworkMismatch | null {
  const rawWallet = (walletNetwork ?? "").trim();
  if (!rawWallet) return null;

  const app = canonicalNetwork(appNetwork ?? "");
  const wallet = canonicalNetwork(rawWallet);

  if (!app || app === wallet) return null;
  return { appNetwork, walletNetwork: rawWallet };
}
