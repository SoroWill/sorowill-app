'use client';

import { useEffect, useRef, useState } from 'react';

import { getRpcUrl } from '@/lib/sorowill';
import { useMounted } from '@/lib/useMounted';
import {
  fetchNetworkStatus,
  type NetworkStatus,
} from '@/lib/networkStatus';

/** How often the monitor re-samples the network. */
export const NETWORK_STATUS_INTERVAL_MS = 30_000;

const HEALTH_STYLES: Record<NetworkStatus['health'], string> = {
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  offline: 'border-red-500/30 bg-red-500/10 text-red-300',
};

const HEALTH_LABELS: Record<NetworkStatus['health'], string> = {
  healthy: 'Operational',
  degraded: 'Degraded',
  offline: 'Offline',
};

const TREND_LABELS: Record<NetworkStatus['feeTrend'], string> = {
  rising: '▲ Rising',
  falling: '▼ Falling',
  stable: '● Stable',
};

function formatSpeed(seconds: number | null): string {
  if (seconds === null) return '—';
  return seconds < 1 ? '<1s' : `~${Math.round(seconds)}s`;
}

function formatFee(stroops: number | null): string {
  if (stroops === null) return '—';
  return `${stroops} stroops`;
}

/**
 * Displays Stellar network status and health: ledger health, fee (gas price)
 * trend and estimated transaction speed, with a warning banner on issues (#896).
 */
export function NetworkStatusMonitor() {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const previousBaseFee = useRef<number | null>(null);
  const mounted = useMounted();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let rpcUrl: string;
      try {
        rpcUrl = getRpcUrl();
      } catch (err) {
        if (!cancelled) {
          setStatus({
            health: 'offline',
            ledgerCloseSeconds: null,
            transactionSpeedSeconds: null,
            baseFeeInStroops: null,
            feeChangePercent: null,
            feeTrend: 'stable',
            warnings: ['Network status is unavailable: the RPC URL is not configured.'],
            error: err instanceof Error ? err.message : 'Invalid RPC URL',
          });
        }
        return;
      }
      const next = await fetchNetworkStatus(rpcUrl, previousBaseFee.current);
      if (next.baseFeeInStroops !== null) previousBaseFee.current = next.baseFeeInStroops;
      if (!cancelled) setStatus(next);
    };
    void run();
    const id = setInterval(run, NETWORK_STATUS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!mounted || !status) {
    return <div className="h-24 rounded-xl border border-white/10 bg-white/5 animate-pulse" aria-hidden="true" />;
  }

  const hasIssues = status.health !== 'healthy' || status.warnings.length > 0;

  return (
    <section
      aria-label="Network status"
      data-testid="network-status-monitor"
      data-network-health={status.health}
      className="space-y-3"
    >
      <div className={`rounded-xl border p-4 ${HEALTH_STYLES[status.health]}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Network status</h2>
          <span role="status" aria-live="polite" className="text-xs font-semibold uppercase tracking-wider">
            {HEALTH_LABELS[status.health]}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-70">Gas price trend</dt>
            <dd className="font-semibold">
              {TREND_LABELS[status.feeTrend]}{' '}
              <span className="font-normal opacity-80">({formatFee(status.baseFeeInStroops)})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-70">Transaction speed</dt>
            <dd className="font-semibold">{formatSpeed(status.transactionSpeedSeconds)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-70">Last ledger</dt>
            <dd className="font-semibold">{formatSpeed(status.ledgerCloseSeconds)} ago</dd>
          </div>
        </dl>
      </div>

      {hasIssues && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          <p className="font-semibold">Network issues detected</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {status.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
