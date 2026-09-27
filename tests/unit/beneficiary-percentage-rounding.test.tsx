import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { validateBeneficiaryPercentages } from '@/lib/beneficiaryValidation';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';

describe('Beneficiary percentage validation & basis points rounding (#445)', () => {
  const ADDR1 = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB';
  const ADDR2 = 'GCEZWKCA5VLDGRLN5RGDQ6KFDCLRTCWDQET46Z6UTUZ65ACNCKAX2MZK';
  const ADDR3 = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const ADDR4 = 'GD7T25NOHD352F7N5T3Y6R3Y6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z6Z';

  describe('Benchmark Acceptance Test Cases', () => {
    it('accepts 33.33 + 33.33 + 33.34 as exactly 100% via basis points encoding', () => {
      const beneficiaries = [
        { address: ADDR1, percentage: 33.33 },
        { address: ADDR2, percentage: 33.33 },
        { address: ADDR3, percentage: 33.34 },
      ];

      const result = validateBeneficiaryPercentages(beneficiaries);
      expect(result.isValid).toBe(true);
      expect(result.totalPercentage).toBe(100);
      expect(result.message).toBeNull();
      expect(result.hasRoundingWarning).toBe(true);
    });

    it('accepts 50 + 50', () => {
      const beneficiaries = [
        { address: ADDR1, percentage: 50 },
        { address: ADDR2, percentage: 50 },
      ];

      const result = validateBeneficiaryPercentages(beneficiaries);
      expect(result.isValid).toBe(true);
      expect(result.totalPercentage).toBe(100);
      expect(result.message).toBeNull();
      expect(result.hasRoundingWarning).toBe(false);
    });

    it('accepts 25 + 25 + 25 + 25', () => {
      const beneficiaries = [
        { address: ADDR1, percentage: 25 },
        { address: ADDR2, percentage: 25 },
        { address: ADDR3, percentage: 25 },
        { address: ADDR4, percentage: 25 },
      ];

      const result = validateBeneficiaryPercentages(beneficiaries);
      expect(result.isValid).toBe(true);
      expect(result.totalPercentage).toBe(100);
      expect(result.message).toBeNull();
      expect(result.hasRoundingWarning).toBe(false);
    });
  });

  describe('Precision Constraints', () => {
    it('rejects percentages with more than 2 decimal places', () => {
      const beneficiaries = [
        { address: ADDR1, percentage: 33.333 },
        { address: ADDR2, percentage: 33.333 },
        { address: ADDR3, percentage: 33.334 },
      ];

      const result = validateBeneficiaryPercentages(beneficiaries);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('at most 2 decimal places');
    });

    it('rejects totals that do not sum to 100% after basis point rounding', () => {
      const beneficiaries = [
        { address: ADDR1, percentage: 33.33 },
        { address: ADDR2, percentage: 33.33 },
        { address: ADDR3, percentage: 33.33 },
      ];

      const result = validateBeneficiaryPercentages(beneficiaries);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('Total must equal 100%');
    });
  });

  describe('BeneficiaryForm UI Integration', () => {
    it('renders Total: 100% ✓ and warning when using 33.33 + 33.33 + 33.34', () => {
      const onChange = vi.fn();
      const beneficiaries = [
        { address: ADDR1, percentage: 33.33 },
        { address: ADDR2, percentage: 33.33 },
        { address: ADDR3, percentage: 33.34 },
      ];

      render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

      expect(screen.getByText(/Total: 100% ✓/)).toBeInTheDocument();
      expect(screen.getByText(/Decimal percentages are encoded into basis points/)).toBeInTheDocument();
    });

    it('does not render rounding warning when all percentages are integers (50 + 50)', () => {
      const onChange = vi.fn();
      const beneficiaries = [
        { address: ADDR1, percentage: 50 },
        { address: ADDR2, percentage: 50 },
      ];

      render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

      expect(screen.getByText(/Total: 100% ✓/)).toBeInTheDocument();
      expect(screen.queryByText(/Decimal percentages are encoded into basis points/)).toBeNull();
    });
  });
});
