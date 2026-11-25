import type { Will } from '@sorowill/sdk';
import { formatUSDC } from '@sorowill/sdk';

import { getSafeBalance } from '@/lib/tokenDecimals';
import type { BatchTopUpResult } from '@/hooks/useBatchTopUp';
import { batchProgress, formatEta, type BatchOperationStatus } from '@/lib/batchProgress';

const STATUS_LABELS: Record<BatchOperationStatus, string> = {
  pending: 'Waiting',
  running: 'Submitting…',
  success: '✓ Success',
  error: '',
  cancelled: 'Cancelled',
};

const STATUS_CLASSES: Record<BatchOperationStatus, string> = {
  pending: 'text-will-light/50',
  running: 'text-amber-300',
  success: 'text-emerald-400',
  error: 'text-red-400',
  cancelled: 'text-will-light/50',
};

interface BatchTopUpPanelProps {
  amounts: Record<string, string>;
  exceedsBalance: boolean;
  invalidWillIds: string[];
  isSubmitting: boolean;
  /** Stops the batch before its next operation (#883). */
  onCancel?: () => void;
  /** When the current batch started, for the time estimate (#883). */
  startedAt?: number | null;
  /** Current time, injectable for tests. */
  now?: number;
  onAmountChange: (willId: string, amount: string) => void;
  onSubmit: () => void;
  results: Record<string, BatchTopUpResult>;
  selectedWillIds: string[];
  total: bigint;
  walletBalance: string | null;
  wills: Will[];
}

/** Presentational batch-top-up panel; state and transaction work live in useBatchTopUp. */
export function BatchTopUpPanel({
  amounts,
  exceedsBalance,
  invalidWillIds,
  isSubmitting,
  onAmountChange,
  onCancel,
  onSubmit,
  results,
  selectedWillIds,
  startedAt = null,
  now,
  total,
  walletBalance,
  wills,
}: BatchTopUpPanelProps) {
  const statuses = selectedWillIds
    .map((id) => results[id]?.status)
    .filter((status): status is BatchOperationStatus => Boolean(status));
  const progress = statuses.length > 0 ? batchProgress(statuses, startedAt, now) : null;
  const eta = isSubmitting && progress ? formatEta(progress.etaMs) : '';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="rounded-xl border border-will-purple/30 bg-will-purple/5 p-5 space-y-4"
    >
      <h3 className="text-sm font-semibold text-will-light">
        Batch Top-up ({selectedWillIds.length} will{selectedWillIds.length === 1 ? '' : 's'} selected)
      </h3>
      <p className="text-xs text-will-light/60">Specify the top-up amount for each selected will.</p>

      {progress ? (
        <div className="space-y-1" data-testid="batch-progress">
          <div
            role="progressbar"
            aria-label="Batch top-up progress"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
          >
            <div className="h-full bg-will-purple transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="text-xs text-will-light/70" aria-live="polite">
            {progress.completed} of {progress.total} done ({progress.percent}%)
            {eta ? ` · ${eta} remaining` : ''}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {selectedWillIds.map((willId) => {
          const will = wills.find((candidate) => candidate.id === willId);
          const result = results[willId];
          return (
            <div key={willId} className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-semibold text-sm text-will-light">Will #{willId}</span>
                <span className="text-xs text-will-light/50 block">
                  Current balance: {will ? formatUSDC(getSafeBalance(will.balance)) : '0.00'} USDC
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
                    value={amounts[willId] || ''}
                    onChange={(event) => onAmountChange(willId, event.target.value)}
                    className="rounded-lg border border-white/10 bg-will-dark px-3 py-1 text-sm text-will-light focus:border-will-purple focus:outline-none w-36"
                  />
                  <span className="text-xs text-will-light/70">USDC</span>
                </div>
                {invalidWillIds.includes(willId) && (
                  <span className="text-xs font-medium text-amber-300">
                    ✗ {amounts[willId]?.trim() ? 'Invalid amount — fix before submitting' : 'Amount required'}
                  </span>
                )}
                {result && (
                  <span className={`text-xs font-medium ${STATUS_CLASSES[result.status]}`} data-status={result.status}>
                    {result.status === 'error' ? `✗ ${result.message}` : STATUS_LABELS[result.status]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-white/10">
        <span className="text-sm font-semibold text-will-light">
          Total Amount: {formatUSDC(total)} USDC
          {exceedsBalance && <span className="block text-xs font-normal text-red-400">Total exceeds your available balance ({walletBalance} USDC).</span>}
          {invalidWillIds.length > 0 && <span className="block text-xs font-normal text-red-400">Enter a valid amount for every selected will (no scientific notation).</span>}
          {invalidWillIds.length > 0 && <span className="block text-xs font-normal text-red-400">Fix the {invalidWillIds.length} highlighted will{invalidWillIds.length === 1 ? '' : 's'} before submitting — nothing has been sent yet.</span>}
        </span>
        {isSubmitting && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40"
            title="Stops before the next top-up; a top-up already submitted cannot be recalled"
          >
            Cancel remaining
          </button>
        ) : null}
        <button type="submit" disabled={isSubmitting || invalidWillIds.length > 0 || exceedsBalance} className="rounded-full bg-will-purple px-5 py-2 text-sm font-semibold text-white transition hover:bg-will-purple/90 disabled:opacity-60">
          {isSubmitting ? 'Submitting Batch…' : 'Submit Batch Top-up'}
        </button>
      </div>
    </form>
  );
}
