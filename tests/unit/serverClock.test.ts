import { describe, it, expect } from 'vitest';
import { applyClockOffset, computeClockOffset } from '@/lib/serverClock';
import { graceDeadline } from '@/lib/deadlines';
import { claimIsAvailable } from '@/app/inherit/[id]/InheritPageClient';
import { WillStatus, type Will } from '@sorowill/sdk';

describe('server clock skew', () => {
  it('computes zero offset when clocks agree', () => {
    expect(computeClockOffset(1_000_500, 1_000_000, 1_001_000)).toBe(0);
  });

  it('detects a local clock that is ahead of the server', () => {
    const offset = computeClockOffset(1_000_000, 1_600_000, 1_600_000);
    expect(offset).toBe(-600_000);
  });

  it('detects a local clock that is behind the server', () => {
    expect(computeClockOffset(2_000_000, 1_000_000, 1_000_000)).toBe(1_000_000);
  });

  it('uses the corrected time for grace-period checks', () => {
    const serverTime = Date.parse('2030-01-10T00:00:00Z');
    const will = {
      triggerTime: new Date(serverTime - 86_400_000 * 7 + 60_000),
      gracePeriodDays: 7,
    } as unknown as Will;
    const grace = graceDeadline(will);
    // Local clock is 10 minutes ahead: uncorrected, the claim looks available.
    const localNow = serverTime + 600_000;
    expect(claimIsAvailable(WillStatus.Triggered, grace, localNow)).toBe(true);
    const offset = computeClockOffset(serverTime, localNow, localNow);
    expect(claimIsAvailable(WillStatus.Triggered, grace, applyClockOffset(localNow, offset))).toBe(false);
  });
});
