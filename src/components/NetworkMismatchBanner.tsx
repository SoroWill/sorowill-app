'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { safeGetWalletNetwork, safeGetPublicKey } from '@/lib/freighter';
import { getNetwork } from '@/lib/sorowill';
import type { SoroWillNetwork } from '@sorowill/sdk';

const STORAGE_KEY = 'sorowill_network_mismatch_dismissed';

/** How often to re-check the wallet network while the page stays open. */
const POLL_INTERVAL_MS = 4000;

interface Mismatch {
  appNetwork: SoroWillNetwork;
  walletNetwork: string;
}

/** Maps Freighter network strings to SoroWill network identifiers. */
function normalizeWalletNetwork(network: string): SoroWillNetwork | null {
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
 * Stable key identifying a specific app-network / wallet-network mismatch pair,
 * so a dismissal only suppresses the exact pair the user dismissed.
 */
function mismatchKey(mismatch: Mismatch): string {
  const normalized = normalizeWalletNetwork(mismatch.walletNetwork) ?? mismatch.walletNetwork;
  return `${mismatch.appNetwork}|${normalized}`;
}

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function addDismissed(key: string): string[] {
  const next = Array.from(new Set([...readDismissed(), key]));
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage unavailable (private mode, etc.) - suppression is
    // best-effort for this render only.
  }
  return next;
}

export function NetworkMismatchBanner() {
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  // Monotonic token so a slow in-flight check can't overwrite a newer result.
  const runToken = useRef(0);

  const check = useCallback(async () => {
    const token = ++runToken.current;

    const [publicKey, appNetwork, walletInfo] = await Promise.all([
      safeGetPublicKey(),
      Promise.resolve(getNetwork()),
      safeGetWalletNetwork(),
    ]);

    if (token !== runToken.current) return;

    // Only compare when a wallet is actually connected.
    if (!publicKey || !walletInfo) {
      setMismatch(null);
      return;
    }

    const walletNetwork = normalizeWalletNetwork(walletInfo.network);
    if (walletNetwork && walletNetwork !== appNetwork) {
      setMismatch({ appNetwork, walletNetwork: walletInfo.network });
    } else {
      setMismatch(null);
    }
  }, []);

  useEffect(() => {
    setDismissedKeys(readDismissed());

    void check();
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS);

    const onFocus = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      runToken.current++;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [check]);

  function handleDismiss() {
    if (!mismatch) return;
    setDismissedKeys(addDismissed(mismatchKey(mismatch)));
  }

  if (!mismatch || dismissedKeys.includes(mismatchKey(mismatch))) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2.5 text-sm text-amber-300"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>
          Your wallet is connected to <strong className="font-semibold">{mismatch.walletNetwork}</strong>, but this
          app expects <strong className="font-semibold">{mismatch.appNetwork}</strong>. Switch your Freighter
          wallet network to <strong className="font-semibold">{mismatch.appNetwork}</strong> to avoid transaction
          failures.
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-full p-1 text-amber-300/70 transition hover:bg-amber-500/20 hover:text-amber-300"
        aria-label="Dismiss network mismatch warning"
      >
        ✕
      </button>
    </div>
  );
}
