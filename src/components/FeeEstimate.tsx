import { formatStroops, formatStroopsAsXlm, type FeeBreakdown } from '@/lib/fees';

interface FeeEstimateProps {
  /** The fee breakdown to display. */
  fee: FeeBreakdown;
  /** Optional label describing the operation being priced. */
  label?: string;
  className?: string;
}

/**
 * Displays the estimated transaction cost before submission, broken down into
 * the base inclusion fee and the Soroban resource fee, in stroops and lumens.
 */
export function FeeEstimate({ fee, label, className }: FeeEstimateProps) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-will-light/70 ${className ?? ''}`}
      aria-live="polite"
    >
      <p className="font-semibold text-will-light">
        Estimated network fee{label ? ` — ${label}` : ''}
      </p>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-4">
          <dt>Base fee ({fee.operations} op{fee.operations === 1 ? '' : 's'})</dt>
          <dd className="font-mono">{formatStroops(fee.baseFeeStroops)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Resource fee (CPU, I/O, rent)</dt>
          <dd className="font-mono">{formatStroops(fee.resourceFeeStroops)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-white/10 pt-1 font-semibold text-will-light">
          <dt>Total</dt>
          <dd className="font-mono">
            {formatStroops(fee.totalStroops)} ({formatStroopsAsXlm(fee.totalStroops)})
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-will-light/50">
        {fee.simulated
          ? 'Based on a network simulation of this transaction.'
          : 'Estimate only — the final fee is set by the network at submission.'}
      </p>
    </div>
  );
}
