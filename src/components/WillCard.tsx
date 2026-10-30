'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';

import { calculateShares, formatUSDC, getTimeUntilCheckin, WillStatus, type Will } from '@sorowill/sdk';

import { formatCheckinLabel, formatRelativeTime, parseCreatedAt } from '@/lib/deadlines';
import { getSafeBalance } from '@/lib/tokenDecimals';
import { StatusBanner } from './StatusBanner';

/**
 * Splits `text` into segments, flagging case-insensitive occurrences of
 * `query` so callers can render them highlighted (#752).
 */
export function splitHighlight(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle, cursor);
  while (idx !== -1) {
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx), match: false });
    parts.push({ text: text.slice(idx, idx + needle.length), match: true });
    cursor = idx + needle.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-will-purple/40 px-0.5 text-will-light">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export interface WillCardProps {
  /** Active dashboard search term; matching will IDs and addresses are highlighted. */
  searchQuery?: string;
  will: Will;
  /** Shown only when the viewer owns this will and it is still active. */
  onCheckIn?: (willId: string) => void;
  checkingIn?: boolean;
  /** Address of the connected user, to compute and show entitled share when relevant (e.g. Inheriting tab). */
  connectedAddress?: string | null;
  /** If true, surfaces the connected user's entitled share inline. */
  showEntitledShare?: boolean;
}

function WillCardComponent({
  will,
  onCheckIn,
  checkingIn = false,
  connectedAddress,
  showEntitledShare = false,
  searchQuery,
}: WillCardProps) {
  const needle = searchQuery?.trim().toLowerCase() ?? '';
  const matchedWhat = needle
    ? [
        will.id.toLowerCase().includes(needle) ? 'will ID' : null,
        will.beneficiaries?.some((b) => b.address.toLowerCase().includes(needle)) ? 'beneficiary address' : null,
      ].filter(Boolean)
    : [];
  const createdAt = useMemo(() => parseCreatedAt(will), [will]);
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
  const userShare = useMemo(() => {
    if (!showEntitledShare || !connectedAddress || !will.beneficiaries?.length) return null;
    try {
      const shares = calculateShares(will.balance.toString(), will.beneficiaries);
      return shares.find(
        (s) => s.address.toLowerCase() === connectedAddress.toLowerCase(),
      );
    } catch {
      return null;
    }
  }, [showEntitledShare, connectedAddress, will.balance, will.beneficiaries]);


  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-will-purple/40 sm:flex-row sm:items-center sm:justify-between"
      aria-label={`Will #${will.id}, ${formatUSDC(getSafeBalance(will.balance))} USDC`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/will/${will.id}`} className="font-semibold text-will-light hover:underline">
            Will #<Highlight text={will.id} query={searchQuery} />
          </Link>
          <StatusBanner status={will.status} compact />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-will-light/70">
          <span>{formatUSDC(getSafeBalance(will.balance))} USDC locked</span>
          {userShare ? (
            <>
              <span className="text-will-light/40">•</span>
              <span className="font-medium text-indigo-300">
                Your share: {formatUSDC(BigInt(userShare.share))} USDC
              </span>
            </>
          ) : null}
          {createdAt ? (
            <>
              <span className="text-will-light/40">•</span>
              <time dateTime={createdAt.toISOString()} title={createdAt.toLocaleString()}>
                Created {formatRelativeTime(createdAt)}
              </time>
            </>
          ) : null}
        </div>

        {will.beneficiaries?.length ? (
          <ul aria-label="Beneficiaries" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-will-light/70">
            {will.beneficiaries.map((beneficiary) => (
              <li key={beneficiary.address} className="truncate">
                <Highlight text={beneficiary.address} query={searchQuery} />
              </li>
            ))}
          </ul>
        ) : null}

        {matchedWhat.length ? (
          <p className="text-xs text-will-light/60">
            Matched {matchedWhat.join(' and ')} for &ldquo;{searchQuery?.trim()}&rdquo;
          </p>
        ) : null}

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

function sameBeneficiaries(a: Will['beneficiaries'], b: Will['beneficiaries']): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => x.address === b[i].address && x.percentage === b[i].percentage);
}

/**
 * Compares the will by the fields the card actually renders rather than by
 * reference, since the dashboard replaces will objects wholesale on every fetch.
 */
export function willCardPropsAreEqual(prev: WillCardProps, next: WillCardProps): boolean {
  const a = prev.will;
  const b = next.will;
  const sameWill =
    a === b ||
    (a.id === b.id &&
      a.status === b.status &&
      a.balance === b.balance &&
      a.gracePeriodDays === b.gracePeriodDays &&
      a.checkinPeriodDays === b.checkinPeriodDays &&
      a.lastCheckin?.getTime() === b.lastCheckin?.getTime() &&
      a.triggerTime?.getTime() === b.triggerTime?.getTime() &&
      parseCreatedAt(a)?.getTime() === parseCreatedAt(b)?.getTime() &&
      sameBeneficiaries(a.beneficiaries, b.beneficiaries));

  return (
    sameWill &&
    prev.onCheckIn === next.onCheckIn &&
    prev.checkingIn === next.checkingIn &&
    prev.connectedAddress === next.connectedAddress &&
    prev.showEntitledShare === next.showEntitledShare &&
    prev.searchQuery === next.searchQuery
  );
}

export const WillCard = memo(WillCardComponent, willCardPropsAreEqual);
