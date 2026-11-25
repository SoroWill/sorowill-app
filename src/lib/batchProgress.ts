/**
 * Progress of a batch operation (#883): how many operations finished, the
 * percentage, and an estimate of the time remaining from the average duration
 * of the operations done so far.
 */
export type BatchOperationStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface BatchProgress {
  completed: number;
  total: number;
  percent: number;
  /** Milliseconds left at the current average pace, or null before the first finishes. */
  etaMs: number | null;
}

const DONE: ReadonlySet<BatchOperationStatus> = new Set(['success', 'error', 'cancelled']);

export function batchProgress(
  statuses: BatchOperationStatus[],
  startedAt: number | null,
  now: number = Date.now(),
): BatchProgress {
  const total = statuses.length;
  const finished = statuses.filter((s) => s === 'success' || s === 'error').length;
  const completed = statuses.filter((s) => DONE.has(s)).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const remaining = statuses.filter((s) => s === 'pending' || s === 'running').length;
  let etaMs: number | null = null;
  if (startedAt !== null && finished > 0) {
    etaMs = remaining === 0 ? 0 : Math.round(((now - startedAt) / finished) * remaining);
  }
  return { completed, total, percent, etaMs };
}

/** "about 12s", "about 2m 5s", or "" when unknown. */
export function formatEta(etaMs: number | null): string {
  if (etaMs === null) return '';
  const seconds = Math.max(0, Math.ceil(etaMs / 1000));
  if (seconds < 60) return `about ${seconds}s`;
  return `about ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
