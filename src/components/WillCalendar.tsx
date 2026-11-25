'use client';

import { useMemo, useState } from 'react';
import type { Will } from '@sorowill/sdk';
import { buildMonthGrid, buildWillEvents, eventsToIcs, type WillEventKind } from '@/lib/willCalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const KIND_STYLES: Record<WillEventKind, { label: string; className: string }> = {
  checkin: { label: 'Checked in', className: 'bg-emerald-500/20 text-emerald-300' },
  deadline: { label: 'Check-in deadline', className: 'bg-amber-500/20 text-amber-300' },
  grace: { label: 'Grace period ends', className: 'bg-red-500/20 text-red-300' },
};

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Month calendar of check-ins and deadlines, with an .ics export (#877). */
export function WillCalendar({ wills, now = new Date() }: { wills: Will[]; now?: Date }) {
  const [month, setMonth] = useState(() => startOfUtcMonth(now));
  const events = useMemo(() => buildWillEvents(wills), [wills]);
  const weeks = useMemo(() => buildMonthGrid(month, events), [month, events]);
  const todayKey = now.toISOString().slice(0, 10);

  const shift = (delta: number) =>
    setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)));

  function handleDownloadIcs() {
    const ics = eventsToIcs(events, new Date(), window.location.origin);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sorowill-deadlines.ics';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <section aria-label="Will calendar" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-full border border-white/20 px-3 py-1 text-sm text-will-light/80">
            ‹
          </button>
          <h2 className="min-w-40 text-center text-sm font-semibold text-will-light" aria-live="polite">
            {monthLabel}
          </h2>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-full border border-white/20 px-3 py-1 text-sm text-will-light/80">
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={handleDownloadIcs}
          disabled={events.every((e) => e.kind === 'checkin')}
          className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-will-light/80 transition hover:border-white/40 disabled:opacity-50"
        >
          Add to calendar (.ics)
        </button>
      </div>

      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col" className="pb-1 font-medium text-will-light/50">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].key}>
              {week.map((cell) => (
                <td
                  key={cell.key}
                  className={`h-16 border border-white/5 align-top p-1 ${cell.key === todayKey ? 'bg-will-purple/10' : ''}`}
                >
                  {cell.day ? <span className="text-will-light/60">{cell.day}</span> : null}
                  <ul className="mt-0.5 space-y-0.5">
                    {cell.events.map((event) => (
                      <li
                        key={`${event.kind}-${event.willId}`}
                        title={event.title}
                        className={`truncate rounded px-1 ${KIND_STYLES[event.kind].className}`}
                      >
                        #{event.willId}
                        <span className="sr-only"> {KIND_STYLES[event.kind].label}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-wrap gap-3 text-xs text-will-light/70" aria-label="Legend">
        {Object.entries(KIND_STYLES).map(([kind, style]) => (
          <li key={kind} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded ${style.className}`} aria-hidden="true" />
            {style.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-will-light/50">Dates are shown in UTC, matching the contract.</p>
    </section>
  );
}
