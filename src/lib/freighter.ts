import {
  connectWallet,
  getPublicKey,
  isFreighterInstalled,
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
 * rendering or if no wallet is currently connected, instead of throwing —
 * convenient for "is a wallet already connected?" checks on mount.
 */
export async function safeGetPublicKey(): Promise<string | null> {
  if (!isBrowser) {
    return null;
  }
  try {
    return await getPublicKey();
  } catch {
    return null;
  }
}

/** Truncates a Stellar address for display, e.g. `GABC...WXYZ`. */
export function truncateAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
