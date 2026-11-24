import type { Will } from '@sorowill/sdk';
import { formatUSDC } from '@sorowill/sdk';

import { getSafeBalance } from '@/lib/tokenDecimals';
import type { BatchTopUpResult } from '@/hooks/useBatchTopUp';

interface BatchTopUpPanelProps {
  amounts: Record<string, string>;
  exceedsBalance: boolean;
  invalidWillIds: string[];
  isSubmitting: boolean;
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
  onSubmit,
  results,
  selectedWillIds,
  total,
  walletBalance,
  wills,
}: BatchTopUpPanelProps) {
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
                {result && (
                  <span className={`text-xs font-medium ${result.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.status === 'success' ? '✓ Success' : `✗ ${result.message}`}
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
        </span>
        <button
          type="submit"
          // Keep keyboard (Enter → form submit) and mouse paths independent, but
          // prevent a click from also submitting the form and calling onSubmit twice.
          onClick={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          disabled={isSubmitting || invalidWillIds.length > 0 || exceedsBalance}
          className="rounded-full bg-will-purple px-5 py-2 text-sm font-semibold text-white transition hover:bg-will-purple/90 disabled:opacity-60"
        >
          {isSubmitting ? 'Submitting Batch…' : 'Submit Batch Top-up'}
        </button>
      </div>
    </form>
  );
}
