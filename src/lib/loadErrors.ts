import { formatError, isWillNotFoundMessage } from './errors';

/**
 * Load-failure reporting for the pages that fetch their data on mount (issue #440).
 *
 * `dashboard/page.tsx`, `will/[id]/page.tsx` and `inherit/[id]/InheritPageClient.tsx`
 * all load inside effects and store the message in state, so an RPC or SDK failure
 * never reaches the route's `error.tsx`. What the user saw instead came straight
 * from `formatError()`, which for anything it does not recognise collapses to
 * "Something went wrong. Please try again later." — a network blip and a broken
 * clone both read the same, and nothing was logged for whoever had to debug it.
 *
 * This module gives the load path one message the issue asks for, keeps the
 * specific wording `formatError` already produces for the failures it understands,
 * and logs the raw error (stack included) before the message is shown.
 */

export type LoadSubject = 'will' | 'inheritance' | 'dashboard';

const SUBJECT_LABEL: Record<LoadSubject, string> = {
  will: 'will',
  inheritance: 'inheritance',
  dashboard: 'your dashboard',
};

/**
 * Failures that are worth repeating to the user in their own words rather than
 * presenting as a connection problem: they say something actionable that
 * "check your connection" would hide. Everything else — a dead RPC, a timeout,
 * a thrown string, an SDK bug — is reported as a load failure that retrying may
 * fix. These mirror the patterns `formatError` recognises.
 */
const SPECIFIC_PATTERNS = [
  'contract',
  'simulation',
  'insufficient',
  'balance',
  'already voted',
  'not a guardian',
  'not guardian',
  'unauthorized',
];

/** What the user should see when a data load failed and retrying is the way out. */
export function loadFailureMessage(error: unknown, subject: LoadSubject = 'will'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = raw.toLowerCase();

  if (normalized.length > 0) {
    const isSpecific =
      isWillNotFoundMessage(normalized) ||
      SPECIFIC_PATTERNS.some((pattern) => normalized.includes(pattern));

    if (isSpecific) return formatError(error);
  }

  return `Could not load ${SUBJECT_LABEL[subject]} — check your connection`;
}

/**
 * Logs the failure with its full stack and returns the message to show. Used by
 * every initial-load catch block, so nothing reaches the UI unlogged.
 */
export function reportLoadError(error: unknown, subject: LoadSubject = 'will'): string {
  const message = loadFailureMessage(error, subject);

  // The stack lives on the error object itself, so it is passed through rather
  // than stringified into the message.
  console.error(`[load] could not load ${SUBJECT_LABEL[subject]}: ${message}`, error);

  return message;
}
