import { describe, it, expect } from 'vitest';
import { WillStatus, type Will } from '@sorowill/sdk';
import { buildMonthGrid, buildWillEvents, eventsToIcs, utcDayKey } from '../../src/lib/willCalendar';

const DAY = 86_400_000;

function will(overrides: Partial<Will>): Will {
  return {
    id: '1',
    status: WillStatus.Active,
    lastCheckin: new Date(Date.UTC(2026, 0, 10, 12)),
    checkinPeriodDays: 30,
    gracePeriodDays: 7,
    triggerTime: undefined,
    ...overrides,
  } as unknown as Will;
}

describe('will calendar (#877)', () => {
  it('marks the last check-in and the next deadline of an active will', () => {
    const events = buildWillEvents([will({})]);
    expect(events.map((e) => [e.kind, utcDayKey(e.date)])).toEqual([
      ['checkin', '2026-01-10'],
      ['deadline', '2026-02-09'],
    ]);
  });

  it('marks the grace deadline of a triggered will and no check-in deadline', () => {
    const triggered = will({
      id: '2',
      status: WillStatus.Triggered,
      triggerTime: new Date(Date.UTC(2026, 1, 1)),
    });
    const kinds = buildWillEvents([triggered]).map((e) => e.kind);
    expect(kinds).toEqual(['checkin', 'grace']);
    const grace = buildWillEvents([triggered]).find((e) => e.kind === 'grace')!;
    expect(grace.date.getTime()).toBe(Date.UTC(2026, 1, 1) + 7 * DAY);
  });

  it('lays the month out in Monday-first weeks with each day\'s events', () => {
    const events = buildWillEvents([will({})]);
    const weeks = buildMonthGrid(new Date(Date.UTC(2026, 1, 15)), events); // February 2026
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][6].day).toBe(1); // 1 Feb 2026 is a Sunday
    const cells = weeks.flat();
    expect(cells.filter((c) => c.day !== null)).toHaveLength(28);
    const ninth = cells.find((c) => c.day === 9)!;
    expect(ninth.events.map((e) => e.kind)).toEqual(['deadline']);
  });

  it('exports deadlines (not past check-ins) as iCalendar with a one-day alarm', () => {
    const ics = eventsToIcs(buildWillEvents([will({})]), new Date(Date.UTC(2026, 0, 11)), 'https://app.example');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('DTSTART:20260209T120000Z');
    expect(ics).toContain('SUMMARY:Will #1: check-in deadline');
    expect(ics).toContain('URL:https://app.example/verify/1');
    expect(ics).toContain('TRIGGER:-P1D');
  });
});
