'use client';

import { useEffect, useState } from 'react';

export interface CountdownTimerProps {
  deadline: Date;
  /** Optional label rendered above the countdown, e.g. "Next check-in due". */
  label?: string;
}

export function CountdownTimer({ deadline, label }: CountdownTimerProps) {
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

  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs uppercase tracking-wide text-will-light/60">{label}</span> : null}
      <span className={`font-mono text-2xl font-semibold tabular-nums ${colorClass}`}>
        {overdue ? 'Overdue — ' : ''}
        {pad(days)}:{pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
}
