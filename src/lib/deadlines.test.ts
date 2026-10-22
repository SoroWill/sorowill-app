import { afterEach, describe, expect, it } from 'vitest';
import type { Will } from '@sorowill/sdk';
import { formatDeadlineUtc, graceDeadline, nextCheckinDeadline } from './deadlines';

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const will = {
  lastCheckin: new Date('2026-03-01T12:00:00Z'),
  checkinPeriodDays: 30,
  triggerTime: new Date('2026-03-08T00:00:00Z'),
  gracePeriodDays: 7,
} as unknown as Will;

describe('deadline calculations are timezone independent (UTC)', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland'])(
    'yields the same instants in %s (across DST changes)',
    (tz) => {
      process.env.TZ = tz;
      expect(nextCheckinDeadline(will).toISOString()).toBe('2026-03-31T12:00:00.000Z');
      expect(graceDeadline(will)?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
      expect(formatDeadlineUtc(nextCheckinDeadline(will))).toBe('2026-03-31 12:00 UTC');
    },
  );

  it('returns null grace deadline without a trigger time', () => {
    expect(graceDeadline({ ...will, triggerTime: null } as unknown as Will)).toBeNull();
  });
});
