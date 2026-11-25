'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { calculateShares, formatUSDC, getTimeUntilCheckin, WillStatus, type Will } from '@sorowill/sdk';

import { formatCheckinLabel, formatRelativeTime, parseCreatedAt } from '@/lib/deadlines';
import { getSafeBalance } from '@/lib/tokenDecimals';
import { BeneficiaryListDialog } from './BeneficiaryListDialog';
import { StatusBanner } from './StatusBanner';

/** Reads the creation timestamp from a will, when the SDK provides one. */
function createdAtOf(will: Will): Date | null {
  return parseCreatedAt((will as Will & { createdAt?: unknown }).createdAt);
}

/** Beneficiaries listed on the card before the rest move behind "and N more" (#821). */
export const MAX_CARD_BENEFICIARIES = 3;

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
  /** Disables the card's actions, for example while the dashboard is refreshing. */
  actionsDisabled?: boolean;
  /** Address of the connected user, to compute and show entitled share when relevant (e.g. Inheriting tab). */
  connectedAddress?: string | null;
  /** If true, surfaces the connected user's entitled share inline. */
  showEntitledShare?: boolean;
  /** Called when the will data should be refreshed (manual button or 30s auto-refresh). */
  onRefresh?: (willId: string) => void | Promise<void>;
  /** External loading flag for the will data refresh. */
  refreshing?: boolean;
}

function WillCardComponent({
  will,
  onCheckIn,
  checkingIn = false,
  actionsDisabled = false,
  connectedAddress,
  showEntitledShare = false,
  searchQuery,
  onRefresh,
  refreshing = false,
}: WillCardProps) {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllBeneficiaries, setShowAllBeneficiaries] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh(will.id);
    } finally {
      if (mountedRef.current) {
        setLastRefreshed(new Date());
        setIsRefreshing(false);
      }
    }
  }, [onRefresh, will.id]);

  // Auto-refresh every 30s; cleared on unmount or when the callback changes.
  useEffect(() => {
    if (!onRefresh) return;
    const interval = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [onRefresh, refresh]);

  const loading = isRefreshing || refreshing;
  const needle = searchQuery?.trim().toLowerCase() ?? '';
  const matchedWhat = needle
    ? [
        will.id.toLowerCase().includes(needle) ? 'will ID' : null,
        will.beneficiaries?.some((b) => b.address.toLowerCase().includes(needle)) ? 'beneficiary address' : null,
      ].filter(Boolean)
    : [];
  const shownBeneficiaryCount = (will.beneficiaries ?? []).filter(
    (b, index) => index < MAX_CARD_BENEFICIARIES || (needle !== '' && b.address.toLowerCase().includes(needle)),
  ).length;
  const hiddenBeneficiaries = (will.beneficiaries?.length ?? 0) - shownBeneficiaryCount;
  const createdAt = useMemo(() => createdAtOf(will), [will]);
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

  function handlePrint() {
    window.print();
  }

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-will-purple/40 sm:flex-row sm:items-center sm:justify-between print:border print:border-gray-300 print:bg-white print:text-black print:rounded-none print:shadow-none"
      aria-label={`Will #${will.id}, ${formatUSDC(getSafeBalance(will.balance))} USDC`}
    >
      {/* ── Print header: only visible when printing (#870) ── */}
      <div className="hidden print:block print:mb-4 print:border-b print:border-gray-300 print:pb-3">
        <p className="text-xs text-gray-500">SoroWill — Will Summary</p>
        <p className="text-xs text-gray-400">Printed {new Date().toLocaleString()}</p>
      </div>

      <div className="min-w-0 space-y-1 print:space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/will/${will.id}`}
            className="font-semibold text-will-light hover:underline print:text-black print:no-underline"
          >
            Will #<Highlight text={will.id} query={searchQuery} />
          </Link>
          <StatusBanner status={will.status} compact />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-will-light/70 print:text-gray-700">
          <span>{formatUSDC(getSafeBalance(will.balance))} USDC locked</span>
          {userShare ? (
            <>
              <span className="text-will-light/40 print:text-gray-400">•</span>
              <span className="font-medium text-indigo-300 print:text-gray-800">
                Your share: {formatUSDC(BigInt(userShare.share))} USDC
              </span>
            </>
          ) : null}
          {createdAt ? (
            <>
              <span className="text-will-light/40 print:text-gray-400">•</span>
              <time dateTime={createdAt.toISOString()} title={createdAt.toLocaleString()}>
                Created {formatRelativeTime(createdAt)}
              </time>
            </>
          ) : null}
        </div>

        {/* Check-in / grace period details — always shown in print for full context */}
        <div className="print:block">
          {will.checkinPeriodDays !== undefined ? (
            <p className="hidden text-xs text-gray-500 print:block">
              Check-in period: {will.checkinPeriodDays} day{will.checkinPeriodDays === 1 ? '' : 's'}
            </p>
          ) : null}
          {will.gracePeriodDays !== undefined ? (
            <p className="hidden text-xs text-gray-500 print:block">
              Grace period: {will.gracePeriodDays} day{will.gracePeriodDays === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

        {will.beneficiaries?.length ? (
          <ul
            aria-label="Beneficiaries"
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-will-light/70 print:flex-col print:items-start print:gap-y-1 print:text-gray-700"
          >
            {will.beneficiaries
              .filter(
                (b, index) =>
                  index < MAX_CARD_BENEFICIARIES ||
                  (needle !== '' && b.address.toLowerCase().includes(needle)),
              )
              .map((beneficiary) => (
                <li key={beneficiary.address} className="max-w-full truncate break-all print:truncate-none">
                  <Highlight text={beneficiary.address} query={searchQuery} />
                  {beneficiary.percentage !== undefined ? (
                    <span className="ml-1 text-xs text-will-light/50 print:text-gray-500">
                      ({beneficiary.percentage}%)
                    </span>
                  ) : null}
                </li>
              ))}
            {hiddenBeneficiaries > 0 ? (
              <li className="print:hidden">
                <button
                  type="button"
                  onClick={() => setShowAllBeneficiaries(true)}
                  className="text-xs text-will-purple hover:underline"
                >
                  and {hiddenBeneficiaries} more
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {showAllBeneficiaries && will.beneficiaries?.length ? (
          <BeneficiaryListDialog
            willId={will.id}
            beneficiaries={will.beneficiaries}
            onClose={() => setShowAllBeneficiaries(false)}
          />
        ) : null}

        {matchedWhat.length ? (
          <p className="text-xs text-will-light/60 print:hidden">
            Matched {matchedWhat.join(' and ')} for &ldquo;{searchQuery?.trim()}&rdquo;
          </p>
        ) : null}

        {will.status === WillStatus.Active ? (
          <p className={`text-xs ${colorClass} print:text-gray-700`} role="status">
            {formatCheckinLabel(secondsLeft)}
          </p>
        ) : will.status === WillStatus.Triggered ? (
          <p className="text-xs text-amber-400 print:text-gray-700" role="status">
            {graceDaysLeft <= 0
              ? 'Grace period expired'
              : `Grace period ends in ${graceDaysLeft} day${graceDaysLeft === 1 ? '' : 's'}`}
          </p>
        ) : will.status === WillStatus.Released ? (
          <p className="text-xs text-indigo-300 print:text-gray-700" role="status">
            Inheritance released to beneficiaries
          </p>
        ) : will.status === WillStatus.Cancelled ? (
          <p className="text-xs text-will-light/50 print:text-gray-500" role="status">
            Will cancelled by owner
          </p>
        ) : null}

        <p className="flex items-center gap-1.5 text-xs text-will-light/50 print:hidden">
          {loading ? (
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-will-light/30 border-t-will-light/80"
              role="status"
              aria-label="Refreshing will data"
            />
          ) : null}
          <time dateTime={lastRefreshed.toISOString()} title={lastRefreshed.toLocaleString()}>
            Updated {formatRelativeTime(lastRefreshed)}
          </time>
        </p>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        {onRefresh ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label={`Refresh will ${will.id}`}
            className="rounded-full border border-white/20 px-3 py-1.5 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handlePrint}
          aria-label={`Print will ${will.id} summary`}
          className="rounded-full border border-white/20 px-3 py-1.5 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light"
        >
          Print
        </button>
        {onCheckIn && will.status === WillStatus.Active ? (
          <button
            type="button"
            onClick={() => onCheckIn(will.id)}
            disabled={checkingIn || actionsDisabled}
            aria-label={`Check in for will ${will.id}`}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {checkingIn ? 'Checking in…' : 'Check In'}
          </button>
        ) : null}
        <Link
          href={`/will/${will.id}`}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light sm:flex-none"
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
      createdAtOf(a)?.getTime() === createdAtOf(b)?.getTime() &&
      sameBeneficiaries(a.beneficiaries, b.beneficiaries));

  return (
    sameWill &&
    prev.onCheckIn === next.onCheckIn &&
    prev.checkingIn === next.checkingIn &&
    prev.actionsDisabled === next.actionsDisabled &&
    prev.connectedAddress === next.connectedAddress &&
    prev.showEntitledShare === next.showEntitledShare &&
    prev.searchQuery === next.searchQuery &&
    prev.onRefresh === next.onRefresh &&
    prev.refreshing === next.refreshing
  );
}

export const WillCard = memo(WillCardComponent, willCardPropsAreEqual);
