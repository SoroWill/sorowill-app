import { describe, it, expect } from 'vitest';
import { nextCheckinDeadline, graceDeadline, formatCheckinLabel } from '@/lib/deadlines';
import { WillStatus, type Will } from '@sorowill/sdk';

function makeTestWill(overrides: Partial<Will> = {}): Will {
  return {
    id: '123',
    owner: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345',
    status: WillStatus.Active,
    balance: '1000000000',
    token: 'CUSDC...',
    checkinPeriodDays: 90,
    lastCheckin: new Date('2026-01-01T00:00:00.000Z'),
    gracePeriodDays: 7,
    triggerTime: null,
    beneficiaries: [],
    guardians: [],
    guardianVotes: 0,
    ...overrides,
  } as Will;
}

describe('Deadlines Consistency (#69, #182, #194, #255, #262)', () => {
  it('calculates identical next check-in deadline across modules', () => {
    const will = makeTestWill();
    const deadline = nextCheckinDeadline(will);

    // 2026-01-01 + 90 days = 2026-04-01T00:00:00.000Z
    const expected = new Date('2026-04-01T00:00:00.000Z');
    expect(deadline.getTime()).toBe(expected.getTime());
  });

  it('calculates identical grace period deadline for triggered wills', () => {
    const triggerTime = new Date('2026-05-01T00:00:00.000Z');
    const will = makeTestWill({
      status: WillStatus.Triggered,
      triggerTime,
      gracePeriodDays: 14,
    });

    const deadline = graceDeadline(will);
    // 2026-05-01 + 14 days = 2026-05-15T00:00:00.000Z
    const expected = new Date('2026-05-15T00:00:00.000Z');
    expect(deadline?.getTime()).toBe(expected.getTime());
  });

  it('returns null grace deadline when triggerTime is missing', () => {
    const will = makeTestWill({ status: WillStatus.Triggered, triggerTime: null });
    expect(graceDeadline(will)).toBeNull();
  });

  it('formats checkin label accurately', () => {
    expect(formatCheckinLabel(0)).toBe('Check-in overdue');
    expect(formatCheckinLabel(-10)).toBe('Check-in overdue');
    expect(formatCheckinLabel(3600)).toBe('Check-in due in 1h 0m');
    expect(formatCheckinLabel(86400 * 5)).toBe('Check-in due in 5 days');
  });
});
