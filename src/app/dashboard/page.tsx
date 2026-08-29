'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { WillStatus, type Will, formatUSDC, toStroops } from '@sorowill/sdk';

import { safeGetPublicKey } from '@/lib/freighter';
import { getSoroWillClient, getWillsByGuardian } from '@/lib/sorowill';
import { getInvalidBatchAmounts, isValidAmount } from '@/lib/amount';
import { formatError } from '@/lib/errors';
import { exportWillsToCSV } from '@/lib/willExport';
import { useToast } from '@/components/Toast';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';
import { WillCard } from '@/components/WillCard';

// TODO(#5): Add an activity feed (check-ins, top-ups, guardian votes) once
// @sorowill/sdk exposes an event subscription/query API — SoroWillClient
// currently only exposes will reads/writes, no event history.

type Tab = 'owned' | 'inheriting' | 'guardianship';
type StatusFilter = 'all' | WillStatus;

const STATUS_FILTERS: StatusFilter[] = [
  'all',
  WillStatus.Active,
  WillStatus.Triggered,
  WillStatus.Released,
  WillStatus.Cancelled,
];

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function matchesSearch(will: Will, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (will.id.toLowerCase().includes(normalized)) {
    return true;
  }
  return will.beneficiaries.some((beneficiary) =>
    beneficiary.address.toLowerCase().includes(normalized)
  );
}

function CardSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="space-y-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-3 w-40" />
      </div>
      <div className="skeleton h-8 w-20 rounded-full" />
    </div>
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [checkedWallet, setCheckedWallet] = useState(false);
  const [tab, setTab] = useState<Tab>('owned');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [ownedWills, setOwnedWills] = useState<Will[]>([]);
  const [inheritingWills, setInheritingWills] = useState<Will[]>([]);
  const [guardianWills, setGuardianWills] = useState<Will[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [guardianScanWarning, setGuardianScanWarning] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Batch top-up state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedWillIds, setSelectedWillIds] = useState<string[]>([]);
  const [batchAmounts, setBatchAmounts] = useState<Record<string, string>>({});
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchResults, setBatchResults] = useState<
    Record<string, { status: 'success' | 'error'; message: string; txHash?: string }>
  >({});

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useKeyboardShortcuts({
    onNewWill: () => router.push('/will/new'),
    onSearch: () => searchInputRef.current?.focus(),
    onHelp: () => setShowShortcutsHelp((prev) => !prev),
  });

  const loadWills = useCallback(async (owner: string) => {
    setLoading(true);
    setError(null);
    try {
      const client = getSoroWillClient();
      const [owned, inheriting, guardian] = await Promise.all([
        client.getWillsByOwner(owner),
        client.getWillsByBeneficiary(owner),
        getWillsByGuardian(owner),
      ]);
      if (!isMounted.current) {
        return;
      }
      setOwnedWills(owned);
      setInheritingWills(inheriting);
      setGuardianWills(guardian.wills);
      setGuardianScanWarning(guardian.hasErrors);
      setLastFetchTime(new Date());
    } catch (err) {
      if (!isMounted.current) {
        return;
      }
      setError(formatError(err));
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (publicKey) {
      void loadWills(publicKey);
    }
  }, [publicKey, loadWills]);

  const handleManualRefresh = useCallback(async () => {
    if (!publicKey) return;
    setIsRefreshing(true);
    try {
      const client = getSoroWillClient();
      const [owned, inheriting, guardian] = await Promise.all([
        client.getWillsByOwner(publicKey),
        client.getWillsByBeneficiary(publicKey),
        getWillsByGuardian(publicKey),
      ]);
      setOwnedWills(owned);
      setInheritingWills(inheriting);
      setGuardianWills(guardian.wills);
      setGuardianScanWarning(guardian.hasErrors);
      setLastFetchTime(new Date());
      setError(null);
      toast.success('Data refreshed');
    } catch (err) {
      const message = formatError(err);
      setError(message);
      toast.error(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [publicKey, toast]);

  const handleExportCSV = useCallback(() => {
    const csv = exportWillsToCSV(ownedWills);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sorowill-wills-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [ownedWills]);

  useEffect(() => {
    void safeGetPublicKey().then((key) => {
      if (!isMounted.current) {
        return;
      }
      setPublicKey(key);
      setCheckedWallet(true);
    });
  }, []);

  useEffect(() => {
    if (publicKey) {
      void loadWills(publicKey);
    }
  }, [publicKey, loadWills]);

  async function handleCheckIn(willId: string) {
    setCheckingInId(willId);
    try {
      await getSoroWillClient().checkIn(willId);
      if (publicKey) {
        await loadWills(publicKey);
      }
      toast.success('Check-in successful');
    } catch (err) {
      const message = formatError(err);
      setError(message);
      toast.error(message);
    } finally {
      setCheckingInId(null);
    }
  }

  // Handle individual selection toggle
  function handleToggleSelectWill(willId: string) {
    setSelectedWillIds((prev) => {
      if (prev.includes(willId)) {
        const next = prev.filter((id) => id !== willId);
        const nextAmounts = { ...batchAmounts };
        delete nextAmounts[willId];
        setBatchAmounts(nextAmounts);
        return next;
      } else {
        return [...prev, willId];
      }
    });
  }

  // Handle amount change for specific will
  function handleAmountChange(willId: string, amount: string) {
    setBatchAmounts((prev) => ({
      ...prev,
      [willId]: amount,
    }));
  }

  // Execute batch top-up sequentially to avoid sequence number issues
  async function handleSubmitBatchTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (selectedWillIds.length === 0) return;

    setBatchSubmitting(true);
    setBatchResults({});
    const client = getSoroWillClient();
    const results: typeof batchResults = {};

    for (const willId of selectedWillIds) {
      const amount = batchAmounts[willId];
      if (!amount || !isValidAmount(amount)) {
        results[willId] = { status: 'error', message: 'Invalid or missing amount' };
        continue;
      }

      try {
        const res = await client.topUp(willId, toStroops(amount).toString());
        results[willId] = { status: 'success', message: 'Top-up successful', txHash: res.txHash };
      } catch (err) {
        results[willId] = {
          status: 'error',
          message: formatError(err),
        };
      }
    }

    setBatchResults(results);
    setBatchSubmitting(false);

    // Refresh data
    if (publicKey) {
      await loadWills(publicKey);
    }
  }



  if (checkedWallet && !publicKey) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-xl font-semibold text-will-light">Connect your wallet</h1>
        <p className="mt-2 text-sm text-will-light/60">
          Connect Freighter to see the wills you own and the ones you&apos;re a beneficiary or guardian of.
        </p>
      </div>
    );
  }

  const baseList =
    tab === 'owned' ? ownedWills : tab === 'inheriting' ? inheritingWills : guardianWills;

  const activeList = baseList.filter(
    (will) =>
      matchesSearch(will, search) && (statusFilter === 'all' || will.status === statusFilter),
  );

  const isFiltering = search.trim() !== '' || statusFilter !== 'all';

  // getWillsByGuardian returns every will the address is listed on, including
  // Cancelled/Released ones. Only wills still in force (Active or in their
  // grace period) represent a live guardian responsibility.
  const activeGuardianWills = guardianWills.filter(
    (will) => will.status === WillStatus.Active || will.status === WillStatus.Triggered,
  );

  const invalidBatchWillIds = getInvalidBatchAmounts(selectedWillIds, batchAmounts);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabName: Tab) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      // Simple toggle navigation for keyboard accessibility
      const newTab =
        tabName === 'owned'
          ? 'inheriting'
          : tabName === 'inheriting'
            ? 'guardianship'
            : 'owned';
      setTab(newTab);
      setIsMultiSelectMode(false);
    }
  };
  return (
    <div className="space-y-6">
      {/* Top Guardian Alert */}
      {activeGuardianWills.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300 text-sm flex justify-between items-center">
          <span>
            ℹ️ You are a designated guardian on{' '}
            <strong className="underline">{activeGuardianWills.length} active will(s)</strong>.
          </span>
          <button
            onClick={() => {
              setTab('guardianship');
              setIsMultiSelectMode(false);
            }}
            className="text-xs font-semibold bg-emerald-500 text-white rounded-full px-3 py-1 hover:bg-emerald-500/80 transition"
          >
            View Role
          </button>
        </div>
      )}

      {guardianScanWarning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-300 text-sm">
          ⚠️ Some guardianship data could not be loaded due to a network error. Your guardian list above may be
          incomplete — try refreshing.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold text-will-light">Dashboard</h1>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          {tab === 'owned' && ownedWills.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsMultiSelectMode((m) => !m);
                setSelectedWillIds([]);
                setBatchAmounts({});
                setBatchResults({});
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isMultiSelectMode
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                  : 'border border-white/20 text-will-light/80 hover:border-white/40'
              }`}
            >
              {isMultiSelectMode ? 'Cancel Multi-select' : 'Multi-select Mode'}
            </button>
          )}
          {tab === 'owned' && ownedWills.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light"
            >
              Export CSV
            </button>
          )}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light disabled:cursor-not-allowed disabled:opacity-60"
            title="Refresh data"
          >
            {isRefreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <Link
            href="/will/new"
            className="rounded-full bg-will-purple px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-will-purple/90"
          >
            + New Will
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-will-light/60">
        <span>Last updated {formatTimeAgo(lastFetchTime)}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1" role="tablist">
        <button
          type="button"
          onClick={() => {
            setTab('owned');
            setIsMultiSelectMode(false);
          }}
          onKeyDown={(e) => handleTabKeyDown(e, 'owned')}
          role="tab"
          aria-selected={tab === 'owned'}
          aria-controls="tab-panel"
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            tab === 'owned'
              ? 'bg-will-purple text-white'
              : 'text-will-light/60 hover:text-will-light'
          }`}
        >
          My Wills
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('inheriting');
            setIsMultiSelectMode(false);
          }}
          onKeyDown={(e) => handleTabKeyDown(e, 'inheriting')}
          role="tab"
          aria-selected={tab === 'inheriting'}
          aria-controls="tab-panel"
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            tab === 'inheriting'
              ? 'bg-will-purple text-white'
              : 'text-will-light/60 hover:text-will-light'
          }`}
        >
          Inheriting
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('guardianship');
            setIsMultiSelectMode(false);
          }}
          onKeyDown={(e) => handleTabKeyDown(e, 'guardianship')}
          role="tab"
          aria-selected={tab === 'guardianship'}
          aria-controls="guardianship-panel"
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            tab === 'guardianship'
              ? 'bg-will-purple text-white'
              : 'text-will-light/60 hover:text-will-light'
          }`}
        >
          Guardianship ({guardianWills.length})
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by will ID or beneficiary address"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status} className="bg-will-dark">
              {status === 'all' ? 'All statuses' : status}
            </option>
          ))}
        </select>
      </div>

      {showShortcutsHelp ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-will-light/70"
        >
          <span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">n</kbd> New will</span>
          <span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">/</kbd> Search</span>
          <span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">?</kbd> Toggle this help</span>
          <button
            type="button"
            onClick={() => setShowShortcutsHelp(false)}
            className="ml-auto text-will-light/50 hover:text-will-light"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="text-sm text-red-400 flex items-center gap-3" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-full border border-red-400/50 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-red-400/10"
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* Batch Top-up Form Panel */}
      {tab === 'owned' && isMultiSelectMode && selectedWillIds.length > 0 && (
        <form
          onSubmit={handleSubmitBatchTopUp}
          className="rounded-xl border border-will-purple/30 bg-will-purple/5 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-will-light">
            Batch Top-up ({selectedWillIds.length} will{selectedWillIds.length === 1 ? '' : 's'}{' '}
            selected)
          </h3>
          <p className="text-xs text-will-light/60">
            Specify the top-up amount for each selected will.
          </p>

          <div className="space-y-3">
            {selectedWillIds.map((willId) => {
              const will = ownedWills.find((w) => w.id === willId);
              const result = batchResults[willId];
              return (
                <div
                  key={willId}
                  className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-will-light">Will #{willId}</span>
                    <span className="text-xs text-will-light/50 block">
                      Current balance: {will ? formatUSDC(BigInt(will.balance)) : '0.00'} USDC
                    </span>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Amount (USDC)"
                        required
                        value={batchAmounts[willId] || ''}
                        onChange={(e) => handleAmountChange(willId, e.target.value)}
                        className="rounded-lg border border-white/10 bg-will-dark px-3 py-1 text-sm text-will-light focus:border-will-purple focus:outline-none w-36"
                      />
                      <span className="text-xs text-will-light/70">USDC</span>
                    </div>

                    {result && (
                      <span
                        className={`text-xs font-medium ${
                          result.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {result.status === 'success' ? '✓ Success' : `✗ ${result.message}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-white/10">
            <span className="text-sm font-semibold text-will-light">
              Total Amount:{' '}
              {Object.values(batchAmounts)
                .reduce((sum, val) => sum + (Number(val) || 0), 0)
                .toFixed(2)}{' '}
              USDC
              {invalidBatchWillIds.length > 0 && (
                <span className="block text-xs font-normal text-red-400">
                  Enter a valid amount for every selected will (no scientific notation).
                </span>
              )}
            </span>
            <button
              type="submit"
              disabled={batchSubmitting || invalidBatchWillIds.length > 0}
              className="rounded-full bg-will-purple px-5 py-2 text-sm font-semibold text-white transition hover:bg-will-purple/90 disabled:opacity-60"
            >
              {batchSubmitting ? 'Submitting Batch…' : 'Submit Batch Top-up'}
            </button>
          </div>
        </form>
      )}

      {/* Main Content Pane */}
      <div id={`${tab}-panel`} role="tabpanel">
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : activeList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <span className="text-lg">
                {tab === 'owned' ? '📝' : tab === 'inheriting' ? '👥' : '🛡️'}
              </span>
            </div>
            <h3 className="font-semibold text-will-light">
              {isFiltering
                ? 'No matching wills'
                : tab === 'owned'
                  ? 'No wills yet'
                  : tab === 'inheriting'
                    ? 'Not a beneficiary yet'
                    : 'No guardianship roles'}
            </h3>
            <p className="mt-1 text-sm text-will-light/60">
              {isFiltering
                ? 'No wills match your search or filter.'
                : tab === 'owned'
                  ? "You haven't created any wills. Start protecting your crypto legacy today."
                  : tab === 'inheriting'
                    ? "No one has named you as a beneficiary yet."
                    : "You are not designated as a guardian for any wills."}
            </p>
            {tab === 'owned' && !isFiltering && (
              <Link
                href="/will/new"
                className="mt-4 inline-block rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90"
              >
                Create your first will
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeList.map((will) => (
              <div key={will.id} className="flex items-center gap-3">
                {tab === 'owned' && isMultiSelectMode && (
                  <input
                    type="checkbox"
                    checked={selectedWillIds.includes(will.id)}
                    onChange={() => handleToggleSelectWill(will.id)}
                    className="h-5 w-5 rounded border-white/10 bg-white/5 text-will-purple focus:ring-will-purple accent-will-purple cursor-pointer"
                  />
                )}
                <div className="flex-1">
                  <WillCard
                    will={will}
                    onCheckIn={tab === 'owned' ? handleCheckIn : undefined}
                    checkingIn={checkingInId === will.id}
                    connectedAddress={publicKey}
                    showEntitledShare={tab === 'inheriting'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
