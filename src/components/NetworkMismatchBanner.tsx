'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { safeGetWalletNetwork, safeGetPublicKey } from '@/lib/freighter';
import { getNetwork } from '@/lib/sorowill';
import { detectNetworkMismatch } from '@/lib/validation';
import type { SoroWillNetwork } from '@sorowill/sdk';

const STORAGE_KEY = 'sorowill_network_mismatch_dismissed';

/** How often to re-check the wallet network while the page stays open. */
const POLL_INTERVAL_MS = 4000;

// NetworkMismatchBanner is mounted centrally in HeaderContextArea (#247) and re-evaluates
// on focus/visibility change and polling (#85, #214).

interface Mismatch {
  appNetwork: SoroWillNetwork;
  walletNetwork: string;
}

/**
 * Stable key identifying a specific app-network / wallet-network mismatch pair,
 * so a dismissal only suppresses the exact pair the user dismissed.
 */
function mismatchKey(mismatch: Mismatch): string {
  return `${mismatch.appNetwork}|${mismatch.walletNetwork}`;
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

/**
 * Tracks whether the connected wallet's network differs from the app network.
 * Re-checks on an interval, on window focus and on visibility change.
 * Exposed so transaction forms can disable submission while mismatched.
 */
export function useNetworkMismatch(): Mismatch | null {
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);
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

    const result = detectNetworkMismatch(appNetwork, walletInfo.network);
    setMismatch(result ? { appNetwork: result.appNetwork, walletNetwork: result.walletNetwork } : null);
  }, []);

  useEffect(() => {
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

  return mismatch;
}

export function NetworkMismatchBanner() {
  const mismatch = useNetworkMismatch();
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  useEffect(() => {
    setDismissedKeys(readDismissed());
  }, []);

  function handleDismiss() {
    if (!mismatch) return;
    setDismissedKeys(addDismissed(mismatchKey(mismatch)));
  }

  if (!mismatch || dismissedKeys.includes(mismatchKey(mismatch))) return null;

  return (
    <div
      role="alert"
      data-testid="network-mismatch-banner"
      className="flex items-center justify-between gap-3 bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2.5 text-sm text-amber-300"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>
          Your wallet is connected to <strong className="font-semibold">{mismatch.walletNetwork}</strong>, but this
          app expects <strong className="font-semibold">{mismatch.appNetwork}</strong>. Transactions are disabled
          until you switch your Freighter wallet network to{' '}
          <strong className="font-semibold">{mismatch.appNetwork}</strong>.
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
