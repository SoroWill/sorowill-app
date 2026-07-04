'use client';

import Link from 'next/link';

import { formatUSDC, getTimeUntilCheckin, WillStatus, type Will } from '@sorowill/sdk';

import { StatusBanner } from './StatusBanner';

export interface WillCardProps {
  will: Will;
  /** Shown only when the viewer owns this will and it is still active. */
  onCheckIn?: (willId: string) => void;
  checkingIn?: boolean;
}

export function WillCard({ will, onCheckIn, checkingIn = false }: WillCardProps) {
  const secondsLeft = getTimeUntilCheckin(will);
  const daysLeft = Math.ceil(secondsLeft / 86_400);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-will-purple/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/will/${will.id}`} className="font-semibold text-will-light hover:underline">
            Will #{will.id}
          </Link>
          <StatusBanner status={will.status} compact />
        </div>
        <p className="text-sm text-will-light/70">{formatUSDC(BigInt(will.balance))} USDC locked</p>
        {will.status === WillStatus.Active ? (
          <p className="text-xs text-will-light/50">
            {secondsLeft > 0 ? `Check-in due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Check-in overdue'}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {onCheckIn && will.status === WillStatus.Active ? (
          <button
            type="button"
            onClick={() => onCheckIn(will.id)}
            disabled={checkingIn}
            className="rounded-full bg-will-purple px-4 py-1.5 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkingIn ? 'Checking in…' : 'Check In'}
          </button>
        ) : null}
        <Link
          href={`/will/${will.id}`}
          className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light"
        >
          Details
        </Link>
      </div>
    </div>
  );
}
