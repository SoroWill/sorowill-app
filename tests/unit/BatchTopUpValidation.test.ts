import { describe, it, expect } from 'vitest';
import { getInvalidBatchAmounts } from '@/lib/amount';

/**
 * Regression: the batch top-up flow on the dashboard used to gate each amount
 * with `!amount || Number(amount) <= 0`, which accepts scientific notation
 * like '1e5' (Number('1e5') === 100000). That value then crashed toStroops()
 * on submit — the same bug class as issue #140 (will creation) and the
 * single-will top-up scientific-notation issue.
 *
 * getInvalidBatchAmounts must flag '1e5' (and other non-decimal input) so the
 * submit button stays disabled.
 */
describe('Batch top-up amount validation', () => {
  it("flags a batch amount of '1e5' as invalid", () => {
    const willIds = ['1', '2'];
    const amounts = { '1': '100', '2': '1e5' };

    expect(getInvalidBatchAmounts(willIds, amounts)).toEqual(['2']);
  });

  it('flags other non-decimal or non-positive amounts', () => {
    const willIds = ['1', '2', '3', '4', '5'];
    const amounts = { '1': '1E5', '2': '0', '3': '-10', '4': 'abc', '5': '' };

    expect(getInvalidBatchAmounts(willIds, amounts).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('flags selected wills with no amount entered', () => {
    const willIds = ['1', '2'];
    const amounts = { '1': '50' };

    expect(getInvalidBatchAmounts(willIds, amounts)).toEqual(['2']);
  });

  it('returns an empty list when every selected amount is a valid decimal', () => {
    const willIds = ['1', '2', '3'];
    const amounts = { '1': '100', '2': '0.01', '3': '  2500.50  ' };

    expect(getInvalidBatchAmounts(willIds, amounts)).toEqual([]);
  });

  it('ignores amounts for wills that are no longer selected', () => {
    const willIds = ['1'];
    const amounts = { '1': '100', '2': '1e5' };

    expect(getInvalidBatchAmounts(willIds, amounts)).toEqual([]);
  });
});
