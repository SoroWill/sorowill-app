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

/** Values below this are formatted with their full token precision. */
const SMALL_AMOUNT_THRESHOLD = 0.01;

/**
 * Formats a human-unit token amount (e.g. `0.0001` USDC) for display.
 *
 * Amounts >= 0.01 use two fraction digits with thousands separators
 * (`1000000` → `'1,000,000.00'`). Smaller non-zero amounts keep up to
 * `decimals` fraction digits so they never collapse to `'0.00'`
 * (`0.0001` → `'0.0001'`). Non-zero amounts below the token's smallest unit
 * render as `'< 0.000001'` (for 6 decimals) rather than a misleading zero.
 *
 * @param amount - Amount in whole-token units
 * @param decimals - Token decimal places (defaults to 6, USDC)
 */
export function formatAmount(amount: number, decimals = 6): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return '0.00';
  }

  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const maxDigits = Math.min(Math.max(Math.trunc(decimals), 2), 20);

  if (abs >= SMALL_AMOUNT_THRESHOLD) {
    return (
      sign +
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(abs)
    );
  }

  const smallestUnit = 10 ** -maxDigits;
  if (abs < smallestUnit) {
    return `${sign ? '> -' : '< '}${smallestUnit.toFixed(maxDigits)}`;
  }

  return (
    sign +
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits,
    }).format(abs)
  );
}
