import { WillStatus } from '@sorowill/sdk';

const STATUS_CONFIG: Record<WillStatus, { label: string; className: string; description: string }> = {
  [WillStatus.Active]: {
    label: 'Active',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'This will is active. The owner is checking in on schedule.',
  },
  [WillStatus.Triggered]: {
    label: 'Triggered — grace period running',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'A check-in deadline was missed. The owner can still prove they are alive.',
  },
  [WillStatus.Released]: {
    label: 'Released',
    className: 'bg-will-purple/20 text-indigo-200 border-will-purple/40',
    description: 'The inheritance has been distributed to all beneficiaries.',
  },
  [WillStatus.Cancelled]: {
    label: 'Cancelled',
    className: 'bg-white/10 text-will-light/60 border-white/20',
    description: 'The owner cancelled this will and withdrew the balance.',
  },
};

export interface StatusBannerProps {
  status: WillStatus;
  /** Renders a compact pill instead of the full-width banner. */
  compact?: boolean;
}

export function StatusBanner({ status, compact = false }: StatusBannerProps) {
  const config = STATUS_CONFIG[status];

  if (compact) {
    return (
      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  }

  return (
    <div className={`w-full rounded-xl border px-4 py-3 sm:px-6 sm:py-4 ${config.className}`}>
      <p className="font-semibold">{config.label}</p>
      <p className="mt-1 text-sm opacity-80">{config.description}</p>
    </div>
  );
}
