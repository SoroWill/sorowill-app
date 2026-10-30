'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface CountdownTimerProps {
  deadline: Date;
  /** Optional label rendered above the countdown, e.g. "Next check-in due". */
  label?: string;
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * Spoken form of the remaining time, e.g. "1 day 2 hours 3 minutes remaining".
 * Minute precision keeps the accessible name from changing every second.
 */
function describeRemaining(
  overdueText: string,
  overdue: boolean,
  days: number,
  hours: number,
  minutes: number,
): string {
  if (overdue) return overdueText;
  return `${plural(days, 'day')} ${plural(hours, 'hour')} ${plural(minutes, 'minute')} remaining`;
}

/**
 * `deadline` must be an absolute instant computed in UTC epoch milliseconds
 * (see `src/lib/deadlines.ts`). The remaining time is a pure difference of
 * epoch values, so it is identical in every viewer timezone.
 */
export function CountdownTimer({ deadline, label }: CountdownTimerProps) {
  const t = useTranslations('common');
  const computeSeconds = () => Math.floor((deadline.getTime() - Date.now()) / 1000);
  const [secondsLeft, setSecondsLeft] = useState(() => computeSeconds());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const remaining = computeSeconds();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        stop();
      }
    };

    const start = () => {
      if (!interval) {
        tick();
        interval = setInterval(tick, 1000);
      }
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (typeof document !== 'undefined') {
      if (document.hidden) {
        stop();
      } else {
        start();
      }

      const handleVisibilityChange = () => {
        if (document.hidden) {
          stop();
        } else {
          start();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        stop();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    interval = setInterval(tick, 1000);
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [deadline]);

  const overdue = secondsLeft <= 0;
  const { days, hours, minutes, seconds } = (() => {
    const clamped = Math.max(secondsLeft, 0);
    const d = Math.floor(clamped / 86_400);
    const h = Math.floor((clamped % 86_400) / 3_600);
    const m = Math.floor((clamped % 3_600) / 60);
    const s = Math.floor(clamped % 60);
    return { days: d, hours: h, minutes: m, seconds: s };
  })();

  const colorClass = overdue
    ? 'text-red-400'
    : secondsLeft < 3 * 86_400
      ? 'text-amber-400'
      : 'text-emerald-400';

  const pad = (value: number) => value.toString().padStart(2, '0');

  const remainingDescription = describeRemaining(t('overdue'), overdue, days, hours, minutes);
  const accessibleName = label ? `${label}: ${remainingDescription}` : remainingDescription;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span aria-hidden="true" className="text-xs uppercase tracking-wide text-will-light/60">
          {label}
        </span>
      ) : null}
      <span
        role="timer"
        aria-label={describeRemaining(t('overdue'), overdue, days, hours, minutes)}
        className={`font-mono text-2xl font-semibold tabular-nums ${colorClass}`}
      >
        {overdue ? `${t('overdue')} — ` : ''}
        {pad(days)}:{pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
      <time dateTime={deadline.toISOString()} className="text-xs text-will-light/60">
        Due {deadline.toLocaleString()}
        {overdue ? '' : ` (${plural(Math.ceil(secondsLeft / 86_400), 'day')} left)`}
      </time>
    </div>
  );
}
