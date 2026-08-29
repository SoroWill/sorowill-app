import { toStroops } from '@sorowill/sdk';

/**
 * Validates that an amount string can be successfully parsed by toStroops().
 * This rejects scientific notation (e.g., '1e5') and other invalid formats
 * that would cause toStroops() to throw.
 *
 * @param amount - The amount string to validate
 * @returns true if the amount is valid and can be safely passed to toStroops()
 */
export function isValidAmount(amount: string): boolean {
  const trimmed = amount.trim();

  // Empty strings are handled at a higher level
  if (trimmed === '') {
    return false;
  }

  // Check if the value can be converted to a positive number
  const num = Number(trimmed);
  if (isNaN(num) || num <= 0) {
    return false;
  }

  // Reject scientific notation (contains 'e' or 'E')
  if (/[eE]/.test(trimmed)) {
    return false;
  }

  // Try to call toStroops to ensure it doesn't throw
  try {
    toStroops(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Top-up amount validator used inline in the will detail UI. Delegates to
 * isValidAmount so both validators reject scientific notation the same way.
 */
export function isTopUpAmountValid(amount: string): boolean {
  return isValidAmount(amount);
}

/**
 * Returns the subset of `willIds` whose batch top-up amount is missing or
 * invalid. An amount is invalid if it is absent, empty, non-positive, written
 * in scientific notation (e.g. '1e5'), or otherwise not parseable by
 * toStroops(). Used to gate the batch top-up submit button and to skip bad
 * entries before calling the contract.
 */
export function getInvalidBatchAmounts(
  willIds: string[],
  amounts: Record<string, string>,
): string[] {
  return willIds.filter((willId) => {
    const amount = amounts[willId];
    return amount === undefined || !isValidAmount(amount);
  });
}
