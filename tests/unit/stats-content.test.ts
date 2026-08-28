import { describe, it, expect } from 'vitest';
import { computeStatsFromWills } from '../../src/app/stats/content';
import { WillStatus, type Will } from '@sorowill/sdk';

function makeWill(overrides: Partial<Will>): Will {
  return {
    id: '1',
    owner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    token: 'CCV4OUCZ5TTB3ZLWHJQQZDXHMPNGR65EQ3GLBJ7KX6HLRHOFCJZ4Q4XU',
    balance: '0',
    beneficiaries: [],
    checkinPeriodDays: 30,
    gracePeriodDays: 7,
    lastCheckin: new Date(),
    triggerTime: null,
    status: WillStatus.Active,
    guardians: [],
    guardianVotes: 0,
    ...overrides,
  };
}

describe('computeStatsFromWills (#205)', () => {
  it('counts Active wills and Released inheritances from the real status field', () => {
    const wills = [
      makeWill({ id: '1', status: WillStatus.Active, balance: '1000000000' }), // 100 USDC
      makeWill({ id: '2', status: WillStatus.Active, balance: '500000000' }), // 50 USDC
      makeWill({ id: '3', status: WillStatus.Released, balance: '250000000' }), // 25 USDC
      makeWill({ id: '4', status: WillStatus.Triggered, balance: '750000000' }), // 75 USDC
      makeWill({ id: '5', status: WillStatus.Cancelled, balance: '0' }),
    ];

    const stats = computeStatsFromWills(wills);

    expect(stats.totalWills).toBe(5);
    expect(stats.activeWills).toBe(2);
    expect(stats.completedInheritances).toBe(1);
  });

  it('sums balances (stroops) across all wills for Total Value Locked', () => {
    const wills = [
      makeWill({ id: '1', status: WillStatus.Active, balance: '1000000000' }),
      makeWill({ id: '2', status: WillStatus.Released, balance: '250000000' }),
      makeWill({ id: '3', status: WillStatus.Triggered, balance: '750000000' }),
    ];

    const stats = computeStatsFromWills(wills);

    // 1_000_000_000 + 250_000_000 + 750_000_000 = 2_000_000_000 stroops
    expect(stats.totalValueLocked).toBe('2000000000');
  });

  it('handles empty will list without error', () => {
    const stats = computeStatsFromWills([]);
    expect(stats).toEqual({
      totalWills: 0,
      totalValueLocked: '0',
      activeWills: 0,
      completedInheritances: 0,
    });
  });

  it('does not count Triggered or Cancelled wills as active or completed', () => {
    const wills = [
      makeWill({ id: '1', status: WillStatus.Triggered, balance: '1000000' }),
      makeWill({ id: '2', status: WillStatus.Cancelled, balance: '2000000' }),
    ];

    const stats = computeStatsFromWills(wills);

    expect(stats.activeWills).toBe(0);
    expect(stats.completedInheritances).toBe(0);
    // Triggered + Cancelled balances are still counted in TVL.
    expect(stats.totalValueLocked).toBe('3000000');
  });
});
