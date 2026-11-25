'use client';

import { useTranslations } from 'next-intl';

import type { ExpirationWarning } from '@/lib/deadlines';

const LEVEL_CLASS: Record<ExpirationWarning['level'], string> = {
  30: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  7: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
  1: 'border-red-500/30 bg-red-500/10 text-red-200',
};

export interface ExpirationWarningBannerProps {
  warning: ExpirationWarning;
}

/**
 * Warns the owner that the will expires soon (#898). The copy is chosen by the
 * warning level (30, 7 or 1 day before the deadline) and the banner lists the
 * alert methods the warning is delivered through.
 */
export function ExpirationWarningBanner({ warning }: ExpirationWarningBannerProps) {
  const t = useTranslations('expirationWarning');
  const key = String(warning.level) as '30' | '7' | '1';

  return (
    <div
      role="alert"
      className={`w-full rounded-xl border px-4 py-3 sm:px-6 sm:py-4 print-hide ${LEVEL_CLASS[warning.level]}`}
    >
      <p className="font-semibold">{t(`${key}Title`)}</p>
      <p className="mt-1 text-sm opacity-80">{t(`${key}Description`, { days: warning.daysRemaining })}</p>
      <p className="mt-2 text-xs opacity-70">
        {t('methods', { methods: warning.methods.map((method) => t(`method.${method}`)).join(', ') })}
      </p>
    </div>
  );
}
