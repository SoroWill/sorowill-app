'use client';

import { useEffect, useState } from 'react';
import { getNetwork, resetSoroWillClient } from '@/lib/sorowill';
import { type SoroWillNetwork } from '@sorowill/sdk';
import { DestructiveActionConfirmation } from '@/components/DestructiveActionConfirmation';

export function NetworkSwitcher() {
  const [network, setNetwork] = useState<SoroWillNetwork>('testnet');
  const [mounted, setMounted] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<SoroWillNetwork | null>(null);

  useEffect(() => {
    setNetwork(getNetwork());
    setMounted(true);
  }, []);

  function handleNetworkChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newNetwork = event.target.value as SoroWillNetwork;
    if (newNetwork === network) return;
    setPendingNetwork(newNetwork);
  }

  function confirmNetworkSwitch(newNetwork: SoroWillNetwork) {
    window.localStorage.setItem('sorowill_network', newNetwork);
    setNetwork(newNetwork);
    // Invalidate the cached SoroWillClient singleton so the next
    // module evaluation starts fresh. This is important because
    // Vercel's serverless functions can stay warm across requests,
    // and the SDK's own spec-caching could otherwise serve stale
    // contract state after a network switch.
    resetSoroWillClient();
    // Reload the page to reconstruct client and clear/reset state
    window.location.reload();
  }

  if (!mounted) {
    return <div className="h-9 w-28 rounded-full bg-white/5 animate-pulse" />;
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={network}
        onChange={handleNetworkChange}
        className={`rounded-full border px-3 py-1 text-xs font-semibold bg-will-dark cursor-pointer focus:outline-none transition-all duration-200 ${
          network === 'mainnet'
            ? 'border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60'
            : 'border-amber-500/30 text-amber-400 hover:border-amber-500/60'
        }`}
      >
        <option value="testnet" className="bg-will-dark text-amber-400 font-semibold">
          ● Testnet
        </option>
        <option value="mainnet" className="bg-will-dark text-emerald-400 font-semibold">
          ● Mainnet
        </option>
      </select>
      <DestructiveActionConfirmation
        isOpen={pendingNetwork !== null}
        action="switch_network"
        willId=""
        onCancel={() => setPendingNetwork(null)}
        onConfirm={() => {
          if (pendingNetwork) confirmNetworkSwitch(pendingNetwork);
          setPendingNetwork(null);
        }}
      />
    </div>
  );
}
