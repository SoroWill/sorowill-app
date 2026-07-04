'use client';

import { useEffect, useState } from 'react';

export interface CountdownTimerProps {
  deadline: Date;
  /** Optional label rendered above the countdown, e.g. "Next check-in due". */
  label?: string;
}

function splitDuration(totalSeconds: number) {
  const clamped = Math.max(totalSeconds, 0);
  const days = Math.floor(clamped / 86_400);
  const hours = Math.floor((clamped % 86_400) / 3_600);
  const minutes = Math.floor((clamped % 3_600) / 60);
  const seconds = Math.floor(clamped % 60);
  return { days, hours, minutes, seconds };
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function CountdownTimer({ deadline, label }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.floor((deadline.getTime() - Date.now()) / 1000),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(Math.floor((deadline.getTime() - Date.now()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const overdue = secondsLeft <= 0;
  const { days, hours, minutes, seconds } = splitDuration(secondsLeft);

  const colorClass = overdue
    ? 'text-red-400'
    : secondsLeft < 3 * 86_400
      ? 'text-amber-400'
      : 'text-emerald-400';

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
