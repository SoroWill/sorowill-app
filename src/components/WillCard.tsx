'use client';

import Link from 'next/link';

import { calculateShares, formatUSDC, getTimeUntilCheckin, WillStatus, type Will } from '@sorowill/sdk';

import { formatCheckinLabel } from '@/lib/deadlines';
import { StatusBanner } from './StatusBanner';

export interface WillCardProps {
  will: Will;
  /** Shown only when the viewer owns this will and it is still active. */
  onCheckIn?: (willId: string) => void;
  checkingIn?: boolean;
  /** Address of the connected user, to compute and show entitled share when relevant (e.g. Inheriting tab). */
  connectedAddress?: string | null;
  /** If true, surfaces the connected user's entitled share inline. */
  showEntitledShare?: boolean;
}

export function WillCard({
  will,
  onCheckIn,
  checkingIn = false,
  connectedAddress,
  showEntitledShare = false,
}: WillCardProps) {
  const secondsLeft = getTimeUntilCheckin(will);
  const overdue = secondsLeft <= 0;

  const colorClass = overdue
    ? 'text-red-400'
    : secondsLeft < 3 * 86_400
      ? 'text-amber-400'
      : 'text-emerald-400';

  // Compute grace period deadline countdown for Triggered status
  const graceSecondsLeft = (() => {
    if (will.status !== WillStatus.Triggered || !will.triggerTime) return 0;
    const graceEndMs = will.triggerTime.getTime() + (will.gracePeriodDays ?? 7) * 86_400 * 1000;
    return Math.max(0, Math.ceil((graceEndMs - Date.now()) / 1000));
  })();
  const graceDaysLeft = Math.ceil(graceSecondsLeft / 86_400);

  // Compute entitled share if enabled and connected address matches a beneficiary
  const userShare = (() => {
    if (!showEntitledShare || !connectedAddress || !will.beneficiaries?.length) return null;
    try {
      const shares = calculateShares(will.balance, will.beneficiaries);
      return shares.find(
        (s) => s.address.toLowerCase() === connectedAddress.toLowerCase(),
      );
    } catch {
      return null;
    }
  })();

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-will-purple/40 sm:flex-row sm:items-center sm:justify-between"
      aria-label={`Will #${will.id}, ${formatUSDC(BigInt(will.balance))} USDC`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/will/${will.id}`} className="font-semibold text-will-light hover:underline">
            Will #{will.id}
          </Link>
          <StatusBanner status={will.status} compact />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-will-light/70">
          <span>{formatUSDC(BigInt(will.balance))} USDC locked</span>
          {userShare ? (
            <>
              <span className="text-will-light/40">•</span>
              <span className="font-medium text-indigo-300">
                Your share: {formatUSDC(BigInt(userShare.share))} USDC
              </span>
            </>
          ) : null}
        </div>

        {will.status === WillStatus.Active ? (
          <p className={`text-xs ${colorClass}`} role="status">
            {formatCheckinLabel(secondsLeft)}
          </p>
        ) : will.status === WillStatus.Triggered ? (
          <p className="text-xs text-amber-400" role="status">
            {graceDaysLeft <= 0
              ? 'Grace period expired'
              : `Grace period ends in ${graceDaysLeft} day${graceDaysLeft === 1 ? '' : 's'}`}
          </p>
        ) : will.status === WillStatus.Released ? (
          <p className="text-xs text-indigo-300" role="status">
            Inheritance released to beneficiaries
          </p>
        ) : will.status === WillStatus.Cancelled ? (
          <p className="text-xs text-will-light/50" role="status">
            Will cancelled by owner
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {onCheckIn && will.status === WillStatus.Active ? (
          <button
            type="button"
            onClick={() => onCheckIn(will.id)}
            disabled={checkingIn}
            aria-label={`Check in for will ${will.id}`}
            className="rounded-full bg-will-purple px-4 py-1.5 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkingIn ? 'Checking in…' : 'Check In'}
          </button>
        ) : null}
        <Link
          href={`/will/${will.id}`}
          className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light"
          aria-label={`View details for will ${will.id}`}
        >
          Details
        </Link>
      </div>
    </article>
  );
}
