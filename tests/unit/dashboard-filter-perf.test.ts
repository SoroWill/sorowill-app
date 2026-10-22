import { describe, expect, it } from 'vitest';
import { WillStatus } from '@sorowill/sdk';
import { filterWills } from '@/app/dashboard/page';

describe('dashboard filterWills with large lists', () => {
  const wills = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    status: i % 2 === 0 ? WillStatus.Active : WillStatus.Cancelled,
    beneficiaries: [{ address: `GADDR${i}`, percentage: 100 }],
  })) as never[];

  it('filters 100+ wills quickly', () => {
    const start = performance.now();
    const result = filterWills(wills, 'GADDR1', WillStatus.Active);
    expect(performance.now() - start).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(0);
  });
});
