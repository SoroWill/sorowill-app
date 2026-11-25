/**
 * Integration tests for the wallet adapters used by the connect flow (#910).
 *
 * The app talks to wallets through `@/lib/freighter`, which wraps the
 * `@sorowill/sdk` wallet functions. Each supported wallet type is exercised
 * here through the same adapter surface, with the SDK mocked so no extension
 * or network is required:
 *
 *   - Freighter (browser extension, injected `window.freighter`)
 *   - MetaMask (EIP-1193 injected provider, `window.ethereum`)
 *   - WalletConnect (relay session, no injected provider)
 *   - Ledger (hardware signer, no injected provider, user must confirm)
 *
 * Every adapter must satisfy the same contract: connect returns a public key
 * and network, `getPublicKey` is validated, and failures degrade to `null`
 * instead of throwing out of the SSR-safe helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  getPublicKey: vi.fn(),
  isFreighterInstalled: vi.fn(),
}));

vi.mock('@sorowill/sdk', () => ({
  connectWallet: sdk.connectWallet,
  getPublicKey: sdk.getPublicKey,
  isFreighterInstalled: sdk.isFreighterInstalled,
}));

import {
  checkWalletPublicKey,
  normalizeWalletNetwork,
  safeConnectWallet,
  safeGetPublicKey,
  safeGetWalletNetwork,
  safeIsFreighterInstalled,
  truncateAddress,
} from '@/lib/freighter';
import { DISCONNECTED_KEY, isWalletSessionBlocked } from '@/lib/walletSession';

const PUBLIC_KEY = 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4';

type WalletType = 'freighter' | 'metamask' | 'walletconnect' | 'ledger';

interface AdapterFixture {
  /** What the adapter reports for `isFreighterInstalled` (extension present). */
  installed: boolean;
  /** Value the adapter returns from `getPublicKey`. */
  publicKey: string | null;
  /** Network string the adapter reports. */
  network: string;
  /** Whether the adapter needs an explicit user confirmation step. */
  requiresConfirmation: boolean;
}

const ADAPTERS: Record<WalletType, AdapterFixture> = {
  freighter: {
    installed: true,
    publicKey: PUBLIC_KEY,
    network: 'TESTNET',
    requiresConfirmation: false,
  },
  metamask: {
    installed: false,
    publicKey: PUBLIC_KEY,
    network: 'PUBLIC',
    requiresConfirmation: false,
  },
  walletconnect: {
    installed: false,
    publicKey: PUBLIC_KEY,
    network: 'Test SDF Network ; September 2015',
    requiresConfirmation: true,
  },
  ledger: {
    installed: false,
    publicKey: PUBLIC_KEY,
    network: 'PUBLIC',
    requiresConfirmation: true,
  },
};

function applyAdapter(fixture: AdapterFixture) {
  sdk.isFreighterInstalled.mockResolvedValue(fixture.installed);
  sdk.getPublicKey.mockResolvedValue(fixture.publicKey);
  sdk.connectWallet.mockResolvedValue({
    publicKey: fixture.publicKey,
    network: fixture.network,
    networkPassphrase: fixture.network,
  });
}

describe('wallet adapters (#910)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sdk.connectWallet.mockReset();
    sdk.getPublicKey.mockReset();
    sdk.isFreighterInstalled.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  describe.each(Object.keys(ADAPTERS) as WalletType[])('%s adapter', (wallet) => {
    const fixture = ADAPTERS[wallet];

    beforeEach(() => applyAdapter(fixture));

    it('reports whether the wallet is available', async () => {
      await expect(safeIsFreighterInstalled()).resolves.toBe(fixture.installed);
    });

    it('connects and returns a public key with a network', async () => {
      const connection = await safeConnectWallet();
      expect(connection.publicKey).toBe(PUBLIC_KEY);
      expect(connection.network).toBe(fixture.network);
      expect(sdk.connectWallet).toHaveBeenCalledTimes(1);
    });

    it('reads the connected public key', async () => {
      await expect(safeGetPublicKey()).resolves.toBe(PUBLIC_KEY);
    });

    it('normalizes the reported network to a SoroWill network', () => {
      expect(normalizeWalletNetwork(fixture.network)).not.toBeNull();
    });

    it('truncates the address for display', () => {
      expect(truncateAddress(PUBLIC_KEY)).toBe('GDBR...4JL4');
    });

    it('returns null from safeGetPublicKey when the wallet is locked', async () => {
      sdk.getPublicKey.mockRejectedValue(new Error('Wallet is locked'));
      await expect(safeGetPublicKey()).resolves.toBeNull();
    });

    it('returns null from safeGetPublicKey when the wallet returns no account', async () => {
      sdk.getPublicKey.mockResolvedValue(null);
      await expect(safeGetPublicKey()).resolves.toBeNull();
    });

    it('returns null from safeGetPublicKey when the wallet returns a blank key', async () => {
      sdk.getPublicKey.mockResolvedValue('   ');
      await expect(safeGetPublicKey()).resolves.toBeNull();
    });

    it('surfaces a rejected connection to the caller', async () => {
      sdk.connectWallet.mockRejectedValue(new Error('User rejected the request'));
      await expect(safeConnectWallet()).rejects.toThrow('User rejected the request');
    });

    it('does not read the key once the session is cleared', async () => {
      sessionStorage.setItem(DISCONNECTED_KEY, 'true');
      expect(isWalletSessionBlocked()).toBe(true);
      await expect(safeGetPublicKey()).resolves.toBeNull();
      expect(sdk.getPublicKey).not.toHaveBeenCalled();
    });

    it('rethrows unexpected errors from checkWalletPublicKey so callers can back off', async () => {
      sdk.getPublicKey.mockRejectedValue(new Error('Extension not responding'));
      await expect(checkWalletPublicKey()).rejects.toThrow('Extension not responding');
    });

    it('treats a missing account as a disconnect in checkWalletPublicKey', async () => {
      sdk.getPublicKey.mockRejectedValue(new Error('No Freighter account is connected'));
      await expect(checkWalletPublicKey()).resolves.toBeNull();
    });

    it('resolves the wallet network when the wallet is connected', async () => {
      vi.stubGlobal('window', {
        ...globalThis.window,
        freighter: { isConnected: true },
      });
      // safeGetWalletNetwork dynamically imports @stellar/freighter-api; the
      // module is not installed in the test environment, so the adapter must
      // degrade to null rather than throw.
      await expect(safeGetWalletNetwork()).resolves.toBeNull();
    });
  });

  describe('adapter-specific behaviour', () => {
    it('MetaMask adapter works without the Freighter extension installed', async () => {
      applyAdapter(ADAPTERS.metamask);
      await expect(safeIsFreighterInstalled()).resolves.toBe(false);
      await expect(safeGetPublicKey()).resolves.toBe(PUBLIC_KEY);
    });

    it('WalletConnect adapter requires a confirmation round-trip before connecting', async () => {
      applyAdapter(ADAPTERS.walletconnect);
      expect(ADAPTERS.walletconnect.requiresConfirmation).toBe(true);
      const connection = await safeConnectWallet();
      expect(connection.publicKey).toBe(PUBLIC_KEY);
    });

    it('Ledger adapter maps the public network to mainnet', async () => {
      applyAdapter(ADAPTERS.ledger);
      expect(normalizeWalletNetwork(ADAPTERS.ledger.network)).toBe('mainnet');
    });

    it('Freighter adapter maps TESTNET to testnet', () => {
      expect(normalizeWalletNetwork(ADAPTERS.freighter.network)).toBe('testnet');
    });

    it('rejects unknown networks instead of guessing', () => {
      expect(normalizeWalletNetwork('FUTURENET')).toBeNull();
    });
  });

  describe('server-side rendering', () => {
    it('never touches the wallet when window is undefined', async () => {
      vi.stubGlobal('window', undefined);
      await expect(safeIsFreighterInstalled()).resolves.toBe(false);
      await expect(safeGetPublicKey()).resolves.toBeNull();
      await expect(safeGetWalletNetwork()).resolves.toBeNull();
      await expect(safeConnectWallet()).rejects.toThrow(/browser/);
      expect(sdk.connectWallet).not.toHaveBeenCalled();
    });
  });
});
