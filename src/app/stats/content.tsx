'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WillStatus, type Will } from '@sorowill/sdk';
import { enumerateAllWills, getSoroWillClient } from '@/lib/sorowill';
import { formatError } from '@/lib/errors';
import { useLiveUpdates } from '@/lib/useLiveUpdates';

interface ProtocolStats {
  totalWills: number;
  totalValueLocked: string;
  activeWills: number;
  completedInheritances: number;
}

/** Formats a check-in timestamp for display, or a placeholder when there is none. */
function formatTimestamp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'No check-ins yet';
  return new Date(value).toLocaleString();
}

interface UserInsights {
  willCount: number;
  totalBalance: string;
  lastCheckIn: number | null;
  upcomingDeadlines: { id: number; deadline: number }[];
}

/**
 * Compute protocol stats from a list of wills using the real SDK fields:
 * `status` (WillStatus) for the active/completed counts and `balance` (stroops)
 * for Total Value Locked. Pure so it can be unit-tested (#205).
 */
export function computeStatsFromWills(wills: Will[]): ProtocolStats {
  const totalWills = wills.length;
  const activeWills = wills.filter(
    (w) => w.status === WillStatus.Active
  ).length;
  const completedInheritances = wills.filter(
    (w) => w.status === WillStatus.Released
  ).length;

  // Sum balance (in stroops) across all wills so TVL reflects on-chain value.
  const totalValueLocked = wills.reduce((sum, w) => {
    const balance =
      w.balance === undefined || w.balance === null ? 0n : BigInt(w.balance);
    return sum + balance;
  }, 0n).toString();

  return { totalWills, totalValueLocked, activeWills, completedInheritances };
}

/**
 * Reads the protocol stats once. Uses the client's `getProtocolStats` when it has one, otherwise
 * enumerates every will and derives the stats from real will state (#205, #206, #208).
 */
async function fetchProtocolStats(): Promise<ProtocolStats> {
  const client = getSoroWillClient();

  try {
    const protocolStats = await (client as unknown as { getProtocolStats?: () => Promise<unknown> }).getProtocolStats?.();
    if (protocolStats && typeof protocolStats === 'object') {
      const stats = protocolStats as Record<string, unknown>;
      return {
        totalWills: Number(stats.totalWills || 0),
        totalValueLocked: String(stats.totalValueLocked || '0'),
        activeWills: Number(stats.activeWills || 0),
        completedInheritances: Number(stats.completedInheritances || 0),
      };
    }
  } catch {
    // Method not available, use fallback
  }

  // Fallback: enumerate every will on the contract and derive the
  // stats from real will state. enumerateAllWills() walks sequential
  // IDs until the last one is passed, so it does not silently cap out.
  const wills = await enumerateAllWills();

  const totalWills = wills.length;
  const activeWills = wills.filter((w) => w.status === WillStatus.Active).length;
  const completedInheritances = wills.filter((w) => w.status === WillStatus.Released).length;

  // Total value locked: sum of balances still held by non-terminal wills.
  const totalValueLocked = wills
    .filter((w) => w.status === WillStatus.Active || w.status === WillStatus.Triggered)
    .reduce((sum, w) => sum + BigInt(w.balance || 0), BigInt(0))
    .toString();

  return { totalWills, totalValueLocked, activeWills, completedInheritances };
}

/** Optional push endpoint that tells the page when stats changed. Polling is used when it is unset. */
const STATS_WS_URL = process.env.NEXT_PUBLIC_STATS_WS_URL || undefined;

export function StatsContent() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [insights, setInsights] = useState<UserInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // `background` refreshes keep the numbers on screen (no spinner) and keep the last good data if they fail.
  const loadStats = useCallback(async (background: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }
      const next = await fetchProtocolStats();
      setStats(next);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (!background) setError(formatError(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadStats(false);
  }, [loadStats]);

  const refreshInBackground = useCallback(() => void loadStats(true), [loadStats]);
  const connection = useLiveUpdates(refreshInBackground, { wsUrl: STATS_WS_URL });

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <div className="inline-block animate-spin">
          <svg className="h-8 w-8 text-will-purple" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <p className="mt-4 text-will-light/60">Loading protocol statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
        <p className="font-semibold text-red-400">Error loading stats</p>
        <p className="mt-2 text-sm text-red-300">{error}</p>
        <p className="mt-4 text-xs text-red-300/60">
          This may occur if the network is unavailable or the contract has not been deployed on the selected network.
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6">
        <p className="text-will-light/60">No data available</p>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Wills Created',
      value: stats.totalWills.toLocaleString(),
      description: 'Total number of wills deployed on the protocol',
      color: 'from-will-purple to-blue-600',
    },
    {
      label: 'Total Value Locked',
      // Issue #207: dividing by 1_000_000 converts USDC base units to whole
      // USDC (1 USDC = 10^6 base units) — it is NOT a millions-scale
      // reduction. BigInt division also truncates, so the figure is rounded
      // down to the nearest whole USDC. The copy below and the "About These
      // Metrics" bullet now describe exactly that.
      value: `${(BigInt(stats.totalValueLocked) / BigInt(1000000)).toString()} USDC`,
      description: 'Total USDC held in active wills, rounded down to whole USDC',
      color: 'from-blue-400 to-cyan-500',
    },
    {
      label: 'Active Wills',
      value: stats.activeWills.toLocaleString(),
      description: 'Wills currently in force and checking in regularly',
      color: 'from-cyan-400 to-teal-500',
    },
    {
      label: 'Completed Inheritances',
      value: stats.completedInheritances.toLocaleString(),
      description: 'Inheritances triggered and completed',
      color: 'from-teal-400 to-green-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs text-will-light/60" role="status" aria-live="polite">
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connection === 'live' ? 'bg-emerald-400' : 'bg-amber-400'}`}
            aria-hidden="true"
          />
          {connection === 'live' ? 'Live updates' : 'Updates every 30 seconds'}
        </span>
        <span className="inline-flex items-center gap-2">
          {refreshing && (
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          )}
          {refreshing ? 'Updating…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : null}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
          >
            <h3 className="text-sm font-medium uppercase tracking-wider text-will-light/60">{card.label}</h3>
            <p className={`mt-4 text-4xl font-bold bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>
              {card.value}
            </p>
            <p className="mt-2 text-sm text-will-light/50">{card.description}</p>
          </div>
        ))}
      </div>

      {insights && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold text-will-light">Your Insights</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-will-light/60">Your Wills</p>
              <p className="mt-2 text-2xl font-bold text-will-light">{insights.willCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-will-light/60">Total Balance</p>
              <p className="mt-2 text-2xl font-bold text-will-light">
                {(BigInt(insights.totalBalance) / BigInt(1000000)).toString()} USDC
              </p>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-will-light/60">Last Check-in</p>
              <p className="mt-2 text-2xl font-bold text-will-light">{formatTimestamp(insights.lastCheckIn)}</p>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-will-light/60">Upcoming Deadlines</p>
              {insights.upcomingDeadlines.length === 0 ? (
                <p className="mt-2 text-sm text-will-light/50">No upcoming deadlines</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-will-light/70">
                  {insights.upcomingDeadlines.map((d) => (
                    <li key={d.id} className="flex justify-between gap-3">
                      <span>Will #{d.id}</span>
                      <span>{new Date(d.deadline * 1000).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold text-will-light">About These Metrics</h3>
        <ul className="mt-4 space-y-3 text-sm text-will-light/70">
          <li className="flex gap-3">
            <span className="shrink-0 text-will-purple">→</span>
            <span>
              <strong>Total Wills Created:</strong> All wills ever deployed, including active and completed inheritances.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 text-will-purple">→</span>
            <span>
              <strong>Total Value Locked:</strong> Sum of all USDC held across all active wills, converted from the
              contract&apos;s base units (1 USDC = 1,000,000 base units) and rounded down to the nearest whole USDC.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 text-will-purple">→</span>
            <span>
              <strong>Your Insights:</strong> Your will count, total balance, most recent check-in, and upcoming
              deadlines derived from the wills on the selected network.
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold text-will-light">Data Transparency</h3>
        <p className="mt-3 text-sm text-will-light/70">
          All statistics are derived from on-chain data on the Soroban network. This page refreshes automatically and does not require a wallet connection. The data is immutable and publicly auditable via Stellar Expert.
        </p>
      </div>
    </div>
  );
}
