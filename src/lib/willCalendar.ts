/**
 * Calendar of will dates (#877): last check-ins, upcoming check-in deadlines
 * and grace-period deadlines, as a month grid and as an iCalendar (.ics) file
 * that calendar apps (Google, Apple, Outlook) can import.
 *
 * All dates are UTC instants (see the time model in `deadlines.ts`); the grid
 * places them on UTC calendar days so it agrees with the contract.
 */
import { WillStatus, type Will } from '@sorowill/sdk';
import { graceDeadline, nextCheckinDeadline } from '@/lib/deadlines';

export type WillEventKind = 'checkin' | 'deadline' | 'grace';

export interface WillEvent {
  willId: string;
  kind: WillEventKind;
  date: Date;
  title: string;
}

/** Last check-in, next check-in deadline (active wills) and grace deadline (triggered wills). */
export function buildWillEvents(wills: Will[]): WillEvent[] {
  const events: WillEvent[] = [];
  for (const will of wills) {
    events.push({
      willId: will.id,
      kind: 'checkin',
      date: new Date(will.lastCheckin),
      title: `Will #${will.id}: checked in`,
    });
    if (will.status === WillStatus.Active) {
      events.push({
        willId: will.id,
        kind: 'deadline',
        date: nextCheckinDeadline(will),
        title: `Will #${will.id}: check-in deadline`,
      });
    }
    const grace = graceDeadline(will);
    if (grace) {
      events.push({
        willId: will.id,
        kind: 'grace',
        date: grace,
        title: `Will #${will.id}: grace period ends`,
      });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** `YYYY-MM-DD` of an instant's UTC day. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface CalendarDay {
  key: string;
  /** Day of the month, or null for padding cells before the 1st. */
  day: number | null;
  events: WillEvent[];
}

/** Weeks (Monday first) of the UTC month containing `month`, with each day's events. */
export function buildMonthGrid(month: Date, events: WillEvent[]): CalendarDay[][] {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7; // Monday = 0

  const byDay = new Map<string, WillEvent[]>();
  for (const event of events) {
    const key = utcDayKey(event.date);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  const cells: CalendarDay[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push({ key: `pad-${i}`, day: null, events: [] });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = utcDayKey(new Date(Date.UTC(year, monthIndex, day)));
    cells.push({ key, day, events: byDay.get(key) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push({ key: `pad-end-${cells.length}`, day: null, events: [] });

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * iCalendar export of the deadlines (check-in and grace), each with a one-day
 * reminder, so calendar apps alert before the will can be triggered.
 */
export function eventsToIcs(events: WillEvent[], now: Date = new Date(), origin = ''): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SoroWill//Will deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const event of events.filter((e) => e.kind !== 'checkin')) {
    const start = icsTimestamp(event.date);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.kind}-${event.willId}-${start}@sorowill`,
      `DTSTAMP:${icsTimestamp(now)}`,
      `DTSTART:${start}`,
      `DTEND:${start}`,
      `SUMMARY:${icsEscape(event.title)}`,
      ...(origin ? [`URL:${origin}/verify/${event.willId}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(event.title)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
