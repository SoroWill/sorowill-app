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

/**
 * Formats a numeric, string, or bigint amount into a human-readable display string.
 *
 * Avoids truncating or rounding very small values (e.g. 0.0001 USDC) to "0" or "0.0".
 * Values smaller than 0.01 preserve exact fractional decimals up to the specified
 * token decimal precision. Values smaller than the minimum representable fraction
 * (10^-decimals) fallback to scientific notation (e.g. 1.00e-8).
 *
 * @param amount - The numerical amount to format
 * @param decimals - Token decimal precision (defaults to 6, e.g. for USDC)
 * @returns Human-readable amount string
 */
export function formatAmount(
  amount: number | string | bigint,
  decimals: number = 6,
): string {
  const num = typeof amount === 'number'
    ? amount
    : typeof amount === 'bigint'
    ? Number(amount)
    : Number(amount);

  if (isNaN(num) || num === 0) {
    return '0';
  }

  const abs = Math.abs(num);
  const minRepresentable = Math.pow(10, -decimals);

  if (abs < minRepresentable) {
    return num.toExponential(2);
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(num);
}
