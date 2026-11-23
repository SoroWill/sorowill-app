'use client';

import { useEffect, useState } from 'react';

import { getNetwork } from '@/lib/sorowill';
import { TESTNET_WARNING } from '@/components/NetworkBadge';

/**
 * A slim notice under the header while the app is on the testnet (#818). Renders nothing on
 * mainnet, and nothing until the network is known on the client so server and client markup match.
 */
export function TestnetBanner() {
  const [network, setNetwork] = useState<string | null>(null);

  useEffect(() => {
    try {
      setNetwork(getNetwork());
    } catch {
      setNetwork(null);
    }
  }, []);

  if (network !== 'testnet') return null;

  return (
    <div
      role="status"
      data-testid="testnet-banner"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300"
    >
      <strong className="font-semibold">You are on Testnet.</strong> {TESTNET_WARNING}
    </div>
  );
}
