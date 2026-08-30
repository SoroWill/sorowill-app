'use client';

import { useEffect, useState } from 'react';
import { getNetwork } from '@/lib/sorowill';
import type { SoroWillNetwork } from '@sorowill/sdk';
import { useMounted } from '@/lib/useMounted';

export function NetworkBadge() {
  const [network, setNetwork] = useState<SoroWillNetwork>('testnet');
  const mounted = useMounted();

  useEffect(() => {
    setNetwork(getNetwork());
  }, []);

  if (!mounted) {
    return <div className="h-6 w-20 rounded-full bg-white/5 animate-pulse" />;
  }

  const isMainnet = network === 'mainnet';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
        isMainnet
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
      }`}
      aria-label={`Current network: ${network}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isMainnet ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
        }`}
        aria-hidden="true"
      />
      {network}
    </span>
  );
}
