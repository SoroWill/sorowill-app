import { describe, it, expect } from 'vitest';
import { formatAmount } from '@/lib/amount';

describe('formatAmount precision & small value formatting (#449)', () => {
  it('formats the required benchmark test cases correctly', () => {
    // 0.000001 preserves all 6 decimals without rounding down to "0.0"
    expect(formatAmount(0.000001, 6)).toBe('0.000001');

    // 0.0001 preserves all 4 decimals
    expect(formatAmount(0.0001, 6)).toBe('0.0001');

    // 1 formats cleanly as integer
    expect(formatAmount(1, 6)).toBe('1');

    // 1000000 formats with thousands separators
    expect(formatAmount(1000000, 6)).toBe('1,000,000');
  });

  it('preserves decimals for values smaller than 0.01', () => {
    expect(formatAmount('0.005', 6)).toBe('0.005');
    expect(formatAmount(0.0025, 6)).toBe('0.0025');
    expect(formatAmount('0.000012', 6)).toBe('0.000012');
  });

  it('respects token decimal precision parameter', () => {
    // With 2 decimals (e.g. standard fiat currency token), 0.0001 is below precision and uses scientific notation
    expect(formatAmount(0.0001, 2)).toBe('1.00e-4');

    // With 7 decimals (XLM native SAC), 0.0000001 preserves all 7 decimals
    expect(formatAmount(0.0000001, 7)).toBe('0.0000001');
  });

  it('falls back to scientific notation for amounts smaller than minimum token precision', () => {
    // 0.00000001 is smaller than 10^-6 (6 decimals for USDC)
    expect(formatAmount(0.00000001, 6)).toBe('1.00e-8');
  });

  it('handles zero and invalid inputs gracefully', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount('0')).toBe('0');
    expect(formatAmount('invalid')).toBe('0');
  });
});
