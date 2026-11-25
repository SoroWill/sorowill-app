import type { SoroWillNetwork } from '@sorowill/sdk';

/** localStorage key remembered by the network switcher. */
const NETWORK_STORAGE_KEY = 'sorowill_network';

function validateStellarNetwork(value: string): SoroWillNetwork {
  if (value !== 'testnet' && value !== 'mainnet') {
    throw new Error(
      `Invalid NEXT_PUBLIC_STELLAR_NETWORK: "${value}". Must be exactly 'testnet' or 'mainnet'.`,
    );
  }
  return value;
}

/**
 * The Stellar network configured for this deployment.
 *
 * Kept in its own module so pages and components can read the active network
 * without importing the SoroWill client (and its contract/config validation).
 */
export function getNetwork(): SoroWillNetwork {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    if (stored === 'testnet' || stored === 'mainnet') {
      return stored as SoroWillNetwork;
    }
  }
  return validateStellarNetwork(process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet');
}
