import type { Beneficiary } from '@sorowill/sdk';

export interface BeneficiaryValidationResult {
  isValid: boolean;
  message: string | null;
  totalPercentage: number;
  hasRoundingWarning: boolean;
}

/**
 * Validates beneficiary percentages according to smart contract encoding rules (#445).
 *
 * Rules:
 *  1. At least one beneficiary required.
 *  2. All percentages must be between 0% and 100%.
 *  3. Percentages are restricted to integers or at most 2 decimal places.
 *  4. Total sum must equal exactly 100% using basis point (100 bp = 1%) integer rounding.
 *  5. Warns if rounding could slightly alter fractional distribution.
 */
export function validateBeneficiaryPercentages(
  beneficiaries: Beneficiary[],
): BeneficiaryValidationResult {
  if (beneficiaries.length === 0) {
    return {
      isValid: false,
      message: 'Add at least one beneficiary',
      totalPercentage: 0,
      hasRoundingWarning: false,
    };
  }

  const hasInvalidRange = beneficiaries.some((b) => b.percentage < 0 || b.percentage > 100);
  if (hasInvalidRange) {
    return {
      isValid: false,
      message: 'Percentages must be between 0% and 100%',
      totalPercentage: 0,
      hasRoundingWarning: false,
    };
  }

  // Acceptance Criteria: Percentages are restricted to 2 decimal places or integers
  const hasExceedingDecimals = beneficiaries.some((b) => {
    const rounded = Math.round(b.percentage * 100) / 100;
    return Math.abs(b.percentage - rounded) > 1e-6;
  });
  if (hasExceedingDecimals) {
    return {
      isValid: false,
      message: 'Percentages can have at most 2 decimal places or be whole numbers',
      totalPercentage: 0,
      hasRoundingWarning: false,
    };
  }

  // Acceptance Criteria: Sum validation uses the same rounding logic as contract encoding (basis points)
  const totalBasisPoints = beneficiaries.reduce((sum, b) => sum + Math.round(b.percentage * 100), 0);
  const totalPercentage = totalBasisPoints / 100;

  if (totalBasisPoints !== 10000) {
    return {
      isValid: false,
      message: `Total must equal 100% (currently ${totalPercentage}%)`,
      totalPercentage,
      hasRoundingWarning: false,
    };
  }

  // Acceptance Criteria: User is warned if rounding will change the distribution
  const hasDecimals = beneficiaries.some((b) => !Number.isInteger(b.percentage));

  return {
    isValid: true,
    message: null,
    totalPercentage,
    hasRoundingWarning: hasDecimals,
  };
}
