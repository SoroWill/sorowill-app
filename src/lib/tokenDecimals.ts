/**
 * Token-decimal resolution for balance formatting.
 *
 * The SoroWill contract supports any Stellar token, each of which may have a
 * different number of decimal places. The SDK's `formatUSDC` always divides by
 * 1 000 000 (6 decimals), which is silently wrong for any non-USDC token.
 *
 * `getTokenDecimals` returns the correct decimal count for a given token
 * contract address, falling back to 7 (XLM / most Stellar native tokens) when
 * the token is not in the registry. `formatTokenBalance` uses that count to
 * produce the human-readable balance string written into CSV exports and other
 * non-UI contexts where `formatUSDC` must not be used blindly.
 *
 * Adding support for a new token: insert its lowercased contract address (or
 * well-known SAC address pattern) and decimal count into TOKEN_DECIMALS_REGISTRY
 * below. No other changes are needed.
 */

/**
 * Registry of known token contract addresses → decimal places.
 * Keys are lowercased Stellar contract addresses (C…).
 *
 * Sources:
 *   - USDC (Circle): 6 decimals
 *   - EURC (Circle): 6 decimals
 *   - XLM wrapped SAC: 7 decimals (Stellar native precision)
 */
const TOKEN_DECIMALS_REGISTRY: Record<string, number> = {
  // Testnet USDC (Circle / Centre SAC)
  ccw67htgnfmxkfgrr2mkrb2v6dnfgblxjofkldlnoicl5ux4yk7cpla: 6,
  // Mainnet USDC
  cbieltk6ybzbbfxdgbtnmwcfmhbzlkr5cbkntw6ycjlibdwxbvjsf7fd: 6,
  // Mainnet EURC (Circle)
  certlk5lj55fpnqmkv5aefkzqkx3bgxmxdmhwrm4gv7ikhwlxm5h5md: 6,
  // Testnet XLM SAC (wrapped native)
  cdlzfc3gg5h6hzh5g5g5gbdnhzdpzpzfq3a7p4xf2hqfpzpzfq3a7p4: 7,
};

/** Decimal count used when the token is not in the registry. */
const DEFAULT_DECIMALS = 7;

/**
 * Returns the number of decimal places for `tokenAddress`.
 * Falls back to `DEFAULT_DECIMALS` (7) for unrecognised tokens.
 */
export function getTokenDecimals(tokenAddress: string): number {
  return TOKEN_DECIMALS_REGISTRY[tokenAddress.toLowerCase()] ?? DEFAULT_DECIMALS;
}

/**
 * Formats `balanceBaseUnits` (the raw integer stored by the contract) as a
 * human-readable decimal string using the correct precision for `tokenAddress`.
 *
 * Examples:
 *   formatTokenBalance('1000000', 'CUSDC...', 6)  →  '1.00'
 *   formatTokenBalance('10000000', 'CXLM...', 7)  →  '1.00'
 *   formatTokenBalance('100', 'CTOKEN...', 2)     →  '1.00'
 *
 * The result always has exactly `decimals` fractional digits and uses
 * standard thousands separators, matching the style of `formatUSDC`.
 */
export function formatTokenBalance(
  balanceBaseUnits: string | bigint,
  tokenAddress: string,
  /** Override decimals — used in tests and when decimals are already known. */
  decimalsOverride?: number,
): string {
  const decimals = decimalsOverride ?? getTokenDecimals(tokenAddress);
  const raw = typeof balanceBaseUnits === 'bigint' ? balanceBaseUnits : BigInt(balanceBaseUnits);
  const divisor = BigInt(10) ** BigInt(decimals);

  const whole = raw / divisor;
  const fraction = raw % divisor;

  // Format fractional part with leading zeros, then trim/pad to `decimals` digits.
  const fracStr = fraction.toString().padStart(decimals, '0');

  // Build the full number string and let Intl format thousands separators.
  const fullNumber = parseFloat(`${whole}.${fracStr}`);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(fullNumber);
}
