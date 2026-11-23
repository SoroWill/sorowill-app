import { isWalletSessionBlocked } from './walletSession';

import {
  connectWallet,
  getPublicKey,
  isFreighterInstalled,
  type SoroWillNetwork,
  type WalletConnection,
} from '@sorowill/sdk';

const isBrowser = typeof window !== 'undefined';

/**
 * SSR-safe check for whether the Freighter extension is installed. Always
 * resolves `false` during server-side rendering, since the extension only
 * exists in the browser.
 */
export async function safeIsFreighterInstalled(): Promise<boolean> {
  if (!isBrowser) {
    return false;
  }
  return isFreighterInstalled();
}

/**
 * SSR-safe wrapper around `connectWallet`. Throws if called outside the
 * browser (e.g. during server rendering), since there is no wallet to
 * connect to.
 */
export async function safeConnectWallet(): Promise<WalletConnection> {
  if (!isBrowser) {
    throw new Error('connectWallet can only be called in the browser');
  }
  return connectWallet();
}

/**
 * SSR-safe wrapper around `getPublicKey`. Resolves `null` during server-side
 * rendering or if no wallet is currently connected, instead of throwing â€”
 * convenient for "is a wallet already connected?" checks on mount.
 *
 * The value returned by the wallet is validated: if it is `null`,
 * `undefined`, not a string, or an empty/whitespace-only string, this
 * resolves `null` rather than passing an invalid public key through to
 * callers.
 */
export async function safeGetPublicKey(): Promise<string | null> {
  if (!isBrowser) {
    return null;
  }
  try {
    if (isWalletSessionBlocked()) return null;
    const publicKey = await getPublicKey();
    if (isWalletSessionBlocked()) return null;
    if (typeof publicKey !== 'string' || publicKey.trim() === '') {
      return null;
    }
    return publicKey;
  } catch {
    return null;
  }
}

const NO_ACCOUNT_MESSAGE = 'No Freighter account is connected';

/**
 * Like `safeGetPublicKey`, but only resolves `null` when Freighter reports
 * that no account is connected. Any other failure (extension not responding,
 * transient messaging errors) is rethrown so callers polling the wallet can
 * back off and retry instead of treating it as a disconnect.
 */
export async function checkWalletPublicKey(): Promise<string | null> {
  if (!isBrowser) {
    return null;
  }
  try {
    return await getPublicKey();
  } catch (err) {
    if (err instanceof Error && err.message.includes(NO_ACCOUNT_MESSAGE)) {
      return null;
    }
    throw err;
  }
}

/**
 * SSR-safe wrapper around the Freighter API's `getNetwork`. Resolves
 * with the wallet's currently selected network and passphrase, or null
 * if Freighter is not installed, not connected, or called during SSR.
 *
 * `@stellar/freighter-api` is a direct dependency (declared in
 * package.json) so this import is guaranteed to resolve at build time.
 * It is loaded dynamically to keep extension-specific code out of the
 * server bundle and only pull it in when this function is called in
 * the browser.
 */
export async function safeGetWalletNetwork(): Promise<{
  network: string;
  networkPassphrase: string;
} | null> {
  if (!isBrowser) {
    return null;
  }
  try {
    const { isConnected, getNetwork: getFreighterNetwork } = await import(
      '@stellar/freighter-api'
    );
    const connected = await isConnected();
    if (!connected.isConnected) {
      return null;
    }
    const net = await getFreighterNetwork();
    if (net.error) {
      return null;
    }
    return { network: net.network, networkPassphrase: net.networkPassphrase };
  } catch {
    return null;
  }
}

/** Maps Freighter network strings to SoroWill network identifiers. */
export function normalizeWalletNetwork(network: string): SoroWillNetwork | null {
  const lower = network.toLowerCase();
  if (lower === 'testnet' || lower === 'test network' || lower.includes('test')) {
    return 'testnet';
  }
  if (lower === 'mainnet' || lower === 'public' || lower.includes('main') || lower.includes('public')) {
    return 'mainnet';
  }
  return null;
}

/**
 * Truncates a Stellar address for display, e.g. `GABC...WXYZ`.
 *
 * This helper is Stellar-address-specific: real callers only ever pass a
 * Stellar public key, which is always exactly 56 characters (`G` followed by
 * 55 base32 characters). The `length <= 12` short-circuit below is therefore a
 * defensive no-op for hypothetical non-Stellar input â€” it is unreachable for
 * real Stellar addresses, but kept so the function degrades gracefully rather
 * than producing a nonsensical `slice` result for short strings.
 */
export function truncateAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
