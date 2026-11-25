'use client';

import { useRateLimitStatus } from '@/hooks/useRateLimitStatus';

/**
 * Shows the caller's current API rate limit quota inline.
 *
 * - Displays remaining requests out of the total limit.
 * - Shows the reset time when the window is close to expiring.
 * - Renders an amber warning when remaining requests fall to or below 10 % of
 *   the limit (#881).
 */
export function RateLimitStatusBadge() {
  const { status, loading, error } = useRateLimitStatus();

  if (loading && !status) {
    return (
      <div
        aria-label="Loading rate limit status"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-will-light/50"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />
        Rate limit…
      </div>
    );
  }

  if (error || !status) return null;

  const { limit, remaining, resetInSeconds, warning } = status;

  const colorClass = warning
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    : 'border-white/10 bg-white/5 text-will-light/60';

  const resetLabel =
    resetInSeconds < 60
      ? `${resetInSeconds}s`
      : `${Math.ceil(resetInSeconds / 60)}m`;

  return (
    <div
      role="status"
      aria-label={`API rate limit: ${remaining} of ${limit} requests remaining, resets in ${resetLabel}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${colorClass}`}
    >
      {warning && (
        <span aria-hidden="true" className="font-semibold">
          ⚠️
        </span>
      )}
      <span>
        <span className="font-semibold">{remaining}</span>
        <span className="opacity-70">/{limit}</span> requests
      </span>
      <span className="opacity-50">·</span>
      <span>resets in {resetLabel}</span>
    </div>
  );
}
