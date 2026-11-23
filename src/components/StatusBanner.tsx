import { useTranslations } from 'next-intl';
import { WillStatus } from '@sorowill/sdk';

// `key` names the label in the `status` messages; its description is `<key>Description` (#841).
const STATUS_CONFIG: Record<
  WillStatus,
  { key: 'active' | 'triggered' | 'released' | 'cancelled'; className: string }
> = {
  [WillStatus.Active]: {
    key: 'active',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  [WillStatus.Triggered]: {
    key: 'triggered',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  [WillStatus.Released]: {
    key: 'released',
    className: 'bg-will-purple/20 text-indigo-200 border-will-purple/40',
  },
  [WillStatus.Cancelled]: {
    key: 'cancelled',
    className: 'bg-white/10 text-will-light/60 border-white/20',
  },
};

export interface StatusBannerProps {
  status: WillStatus;
  /** Renders a compact pill instead of the full-width banner. */
  compact?: boolean;
}

export function StatusBanner({ status, compact = false }: StatusBannerProps) {
  const t = useTranslations('status');
  const config = STATUS_CONFIG[status];
  const label = t(config.key);

  if (compact) {
    return (
      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${config.className}`}>
        {label}
      </span>
    );
  }

  return (
    <div className={`w-full rounded-xl border px-4 py-3 sm:px-6 sm:py-4 ${config.className}`}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-sm opacity-80">{t(`${config.key}Description`)}</p>
    </div>
  );
}
