'use client';

import { useEffect, useState } from 'react';
import { WillStatus } from '@sorowill/sdk';
import { enumerateAllWills, getSoroWillClient } from '@/lib/sorowill';
import { formatError } from '@/lib/errors';
import { WillStatus, type Will } from '@sorowill/sdk';

interface ProtocolStats {
  totalWills: number;
  totalValueLocked: string;
  activeWills: number;
  completedInheritances: number;
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

export function StatsContent() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSoroWillClient();

        // Attempt to fetch protocol stats
        // Note: This depends on the contract exposing get_protocol_stats method
        try {
          const protocolStats = await (client as any).getProtocolStats?.();
          if (protocolStats) {
            setStats({
              totalWills: Number(protocolStats.totalWills || 0),
              totalValueLocked: String(protocolStats.totalValueLocked || '0'),
              activeWills: Number(protocolStats.activeWills || 0),
              completedInheritances: Number(protocolStats.completedInheritances || 0),
            });
            return;
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
        const completedInheritances = wills.filter(
          (w) => w.status === WillStatus.Released,
        ).length;

        // Total value locked: sum of balances still held by non-terminal wills.
        const totalValueLocked = wills
          .filter(
            (w) => w.status === WillStatus.Active || w.status === WillStatus.Triggered,
          )
          .reduce((sum, w) => sum + BigInt(w.balance || 0), BigInt(0))
          .toString();

        setStats({
          totalWills,
          totalValueLocked,
          activeWills,
          completedInheritances,
        });
      } catch (err) {
        setError(formatError(err));
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, []);

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
              <strong>Active Wills:</strong> Wills that are currently in execution and have not been triggered by a missed check-in.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 text-will-purple">→</span>
            <span>
              <strong>Completed Inheritances:</strong> Wills where the grace period has expired and funds have been distributed to beneficiaries.
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold text-will-light">Data Transparency</h3>
        <p className="mt-3 text-sm text-will-light/70">
          All statistics are derived from on-chain data on the Soroban network. This page refreshes on load and does not require a wallet connection. The data is immutable and publicly auditable via Stellar Expert.
        </p>
      </div>
    </div>
  );
}
