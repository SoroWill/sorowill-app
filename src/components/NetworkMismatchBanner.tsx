'use client';

import { useEffect, useState } from 'react';

import { safeGetWalletNetwork, safeGetPublicKey } from '@/lib/freighter';
import { getNetwork } from '@/lib/sorowill';
import type { SoroWillNetwork } from '@sorowill/sdk';

const STORAGE_KEY = 'sorowill_network_mismatch_dismissed';

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

export function NetworkMismatchBanner() {
  const [mismatch, setMismatch] = useState<{
    appNetwork: SoroWillNetwork;
    walletNetwork: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if banner was previously dismissed this session
    const wasDismissed = sessionStorage.getItem(STORAGE_KEY) === '1';
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    let cancelled = false;

    async function check() {
      const [publicKey, appNetwork, walletInfo] = await Promise.all([
        safeGetPublicKey(),
        Promise.resolve(getNetwork()),
        safeGetWalletNetwork(),
      ]);

      if (cancelled) return;

      // Only check mismatch when a wallet is connected
      if (!publicKey || !walletInfo) return;

      const walletNetwork = normalizeWalletNetwork(walletInfo.network);
      if (walletNetwork && walletNetwork !== appNetwork) {
        setMismatch({
          appNetwork,
          walletNetwork: walletInfo.network,
        });
      } else {
        setMismatch(null);
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(STORAGE_KEY, '1');
  }

  if (!mismatch || dismissed) return null;

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
