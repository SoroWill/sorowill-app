'use client';

// This boundary catches unexpected render-time errors in the dashboard tree.
// Data-fetch failures during initial load are caught inside loadWills() and
// shown as an inline retry affordance in the component itself — so both paths
// result in a user-friendly message rather than a raw error object.

import { useTranslations } from 'next-intl';

import { formatError } from '@/lib/errors';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  // Log the full error for debugging without exposing it raw to the user.
  if (typeof window !== 'undefined') {
    console.error('[Dashboard] render error:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    });
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
      <h1 className="text-lg font-semibold text-red-300">{t('couldNotLoadDashboard')}</h1>
      {process.env.NODE_ENV !== 'production' && (
        <p className="mt-1 font-mono text-xs text-red-300/40">{formatError(error)}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70"
      >
        {t('tryAgain')}
      </button>
    </div>
  );
}
