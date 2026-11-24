'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

import { WillStatus, formatUSDC, calculateShares, type Will } from '@sorowill/sdk';
import { getSoroWillClient } from '@/lib/sorowill';
import { graceDeadline } from '@/lib/deadlines';
import { getSafeBalance } from '@/lib/tokenDecimals';
import { isValidWillId } from '@/lib/willId';
import { claimIsAvailable } from '@/app/inherit/[id]/InheritPageClient';

// ─── Status display helpers ───────────────────────────────────────────────────

function statusLabel(status: WillStatus): string {
  switch (status) {
    case WillStatus.Active:
      return 'Active';
    case WillStatus.Triggered:
      return 'Triggered — grace period running';
    case WillStatus.Released:
      return 'Released — inheritance distributed';
    case WillStatus.Cancelled:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}

function statusColor(status: WillStatus): string {
  switch (status) {
    case WillStatus.Active:
      return 'text-emerald-400';
    case WillStatus.Triggered:
      return 'text-amber-400';
    case WillStatus.Released:
      return 'text-indigo-300';
    case WillStatus.Cancelled:
      return 'text-will-light/50';
    default:
      return 'text-will-light/70';
  }
}

// ─── Countdown helpers ────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

// ─── Component ────────────────────────────────────────────────────────────────

interface InheritanceStatus {
  will: Will;
  graceDeadlineDate: Date | null;
  canClaim: boolean;
  msUntilClaim: number;
  userShares: { address: string; share: string }[];
}

export default function InheritPage() {
  const [willIdInput, setWillIdInput] = useState('');
  const [status, setStatus] = useState<InheritanceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick every second when a triggered will is loaded so the countdown stays live.
  useEffect(() => {
    if (!status || status.will.status !== WillStatus.Triggered) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const lookup = useCallback(async () => {
    const id = willIdInput.trim();
    if (!id) {
      setError('Enter a will ID.');
      return;
    }
    if (!isValidWillId(id)) {
      setError('Will IDs must be non-negative integers.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const will = await getSoroWillClient().getWill(id);
      const graceDeadlineDate = graceDeadline(will);
      const nowMs = Date.now();
      const canClaim = claimIsAvailable(will.status, graceDeadlineDate, nowMs);
      const msUntilClaim =
        graceDeadlineDate && !canClaim ? Math.max(0, graceDeadlineDate.getTime() - nowMs) : 0;

      let userShares: { address: string; share: string }[] = [];
      try {
        userShares = calculateShares(will.balance.toString(), will.beneficiaries);
      } catch {
        // non-fatal — balance or beneficiary data may be absent
      }

      setNow(nowMs);
      setStatus({ will, graceDeadlineDate, canClaim, msUntilClaim, userShares });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load will. Check the ID and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [willIdInput]);

  // Recompute live countdown values from `now` without re-fetching.
  const liveCanClaim =
    status ? claimIsAvailable(status.will.status, status.graceDeadlineDate, now) : false;
  const liveMsUntilClaim =
    status?.graceDeadlineDate && !liveCanClaim
      ? Math.max(0, status.graceDeadlineDate.getTime() - now)
      : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Inheritance Status</h1>
        <p className="mt-1 text-sm text-will-light/60">
          Enter a will ID to check the inheritance status, your claim eligibility, and the claim deadline.
        </p>
      </div>

      {/* ── Will ID lookup ── */}
      <div className="flex gap-2">
        <input
          type="text"
          value={willIdInput}
          onChange={(e) => setWillIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void lookup(); }}
          placeholder="Will ID (e.g. 42)"
          aria-label="Will ID"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-will-light placeholder:text-will-light/30 focus:border-will-purple/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={loading}
          className="rounded-xl bg-will-purple px-5 py-2.5 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {/* ── Results ── */}
      {status ? (
        <div className="space-y-4">

          {/* Inheritance status */}
          <section
            className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3"
            aria-labelledby="inherit-status-heading"
          >
            <h2 id="inherit-status-heading" className="text-sm font-semibold text-will-light">
              Inheritance status — Will #{status.will.id}
            </h2>
            <div className="grid gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-will-light/50">Status</p>
                <p className={`font-medium ${statusColor(status.will.status)}`}>
                  {statusLabel(status.will.status)}
                </p>
              </div>
              <div>
                <p className="text-xs text-will-light/50">Locked balance</p>
                <p className="text-will-light">{formatUSDC(getSafeBalance(status.will.balance))} USDC</p>
              </div>
              <div>
                <p className="text-xs text-will-light/50">Check-in period</p>
                <p className="text-will-light">
                  {status.will.checkinPeriodDays} day{status.will.checkinPeriodDays === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <p className="text-xs text-will-light/50">Grace period</p>
                <p className="text-will-light">
                  {status.will.gracePeriodDays} day{status.will.gracePeriodDays === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </section>

          {/* Claim eligibility */}
          <section
            className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3"
            aria-labelledby="claim-eligibility-heading"
          >
            <h2 id="claim-eligibility-heading" className="text-sm font-semibold text-will-light">
              Claim eligibility
            </h2>

            {status.will.status === WillStatus.Released ? (
              <div className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-4 py-3 text-sm text-indigo-300">
                Inheritance has already been distributed. No further claims are possible.
              </div>
            ) : status.will.status === WillStatus.Cancelled ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-will-light/60">
                This will was cancelled by its owner. There is nothing to claim.
              </div>
            ) : status.will.status === WillStatus.Active ? (
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
                The will owner is active. Inheritance is not available yet — the owner must miss
                a check-in first.
              </div>
            ) : liveCanClaim ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-will-purple/30 bg-will-purple/10 px-4 py-3 text-sm text-will-light">
                  The grace period has elapsed. Any named beneficiary may now trigger the distribution.
                </div>
                <Link
                  href={`/inherit/${status.will.id}`}
                  className="inline-flex w-full items-center justify-center rounded-full bg-will-purple px-4 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90 active:scale-95"
                >
                  Claim Inheritance
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                  The will has been triggered. Waiting for the grace period to elapse before the
                  inheritance can be claimed.
                </div>
                {status.graceDeadlineDate ? (
                  <p className="text-xs text-will-light/60">
                    Claimable in{' '}
                    <span className="font-mono font-medium text-will-light">
                      {formatCountdown(liveMsUntilClaim)}
                    </span>{' '}
                    <time
                      dateTime={status.graceDeadlineDate.toISOString()}
                      title={status.graceDeadlineDate.toLocaleString()}
                    >
                      (on {status.graceDeadlineDate.toLocaleDateString()})
                    </time>
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* Claim deadline */}
          {status.graceDeadlineDate ? (
            <section
              className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2"
              aria-labelledby="claim-deadline-heading"
            >
              <h2 id="claim-deadline-heading" className="text-sm font-semibold text-will-light">
                Claim deadline
              </h2>
              <p className="text-sm text-will-light/70">
                Grace period ends on{' '}
                <time
                  dateTime={status.graceDeadlineDate.toISOString()}
                  className="font-medium text-will-light"
                >
                  {status.graceDeadlineDate.toLocaleString()}
                </time>
                .
              </p>
              {liveMsUntilClaim > 0 ? (
                <p className="text-xs text-will-light/50">
                  Time remaining:{' '}
                  <span className="font-mono text-will-light">{formatCountdown(liveMsUntilClaim)}</span>
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Beneficiary shares */}
          {status.userShares.length > 0 ? (
            <section
              className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2"
              aria-labelledby="shares-heading"
            >
              <h2 id="shares-heading" className="text-sm font-semibold text-will-light">
                Beneficiary shares
              </h2>
              <ul className="space-y-1.5">
                {status.userShares.map((row) => {
                  const pct = status.will.beneficiaries.find(
                    (b) => b.address === row.address,
                  )?.percentage;
                  return (
                    <li key={row.address} className="flex justify-between text-sm">
                      <span className="max-w-xs truncate font-mono text-will-light/80">
                        {row.address}
                      </span>
                      <span className="shrink-0 pl-4 text-will-light">
                        {pct !== undefined ? `${pct}% · ` : ''}
                        {formatUSDC(BigInt(row.share))} USDC
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
