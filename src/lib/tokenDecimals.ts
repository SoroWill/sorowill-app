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
  ccw67htgnfmxkfgrr2mkrb2v6dnfgblxjofkldlnoicl5ux4yk7cplaa: 6,
  // Mainnet USDC
  cbieltk6ybzbbfxdgbtnmwcfmhbzlkr5cbkntw6ycjlibdwxbvjsf7fd: 6,
  // Mainnet EURC (Circle)
  certlk5lj55fpnqmkv5aefkzqkx3bgxmxdmhwrm4gv7ikhwlxm5h5mda: 6,
  // Testnet XLM SAC (wrapped native)
  cdlzfc3gg5h6hzh5g5g5gbdnhzdpzpzfq3a7p4xf2hqfpzpzfq3a7p4a: 7,
};

/** Decimal count used when the token is not in the registry. */
const DEFAULT_DECIMALS = 7;

/**
 * In-memory cache mapping `${network}-${contractId}` → decimal places.
 */
const tokenDecimalsCache = new Map<string, number>();

/**
 * Constructs a cache key that includes the network identifier and token contract ID.
 */
export function getDecimalsCacheKey(network: string, tokenAddress: string): string {
  return `${network.toLowerCase()}-${tokenAddress.toLowerCase()}`;
}

/**
 * Clears the in-memory token decimals cache. Called when network changes.
 */
export function clearTokenDecimalsCache(): void {
  tokenDecimalsCache.clear();
}

/**
 * Manually seeds or overrides the cached decimal count for a token on a given network.
 */
export function setCachedTokenDecimals(
  tokenAddress: string,
  decimals: number,
  network: string = 'testnet',
): void {
  tokenDecimalsCache.set(getDecimalsCacheKey(network, tokenAddress), decimals);
}

/**
 * Resolves the currently active network safely in both browser and node environments.
 */
function resolveCurrentNetwork(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('sorowill_network');
    if (stored) return stored;
  }
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
}

/**
 * Returns the number of decimal places for `tokenAddress`.
 * Keys cache entries by `network-contractId` to prevent cross-network collisions.
 * Falls back to `DEFAULT_DECIMALS` (7) for unrecognised tokens.
 */
export function getTokenDecimals(tokenAddress: string, network?: string): number {
  const net = network ?? resolveCurrentNetwork();
  const cacheKey = getDecimalsCacheKey(net, tokenAddress);

  const cached = tokenDecimalsCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const resolved = TOKEN_DECIMALS_REGISTRY[tokenAddress.toLowerCase()] ?? DEFAULT_DECIMALS;
  tokenDecimalsCache.set(cacheKey, resolved);
  return resolved;
}

/**
 * Formats `balanceBaseUnits` (the raw integer stored by the contract) as a
 * human-readable decimal string using the correct precision for `tokenAddress`.
 *
 * Examples:
 *   formatTokenBalance('1000000', 'CUSDC...', 6)  →  '1.000000'
 *   formatTokenBalance('10000000', 'CXLM...', 7)  →  '1.0000000'
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

  const isNegative = raw < 0n;
  const absRaw = isNegative ? -raw : raw;

  if (decimals <= 0) {
    const formattedWhole = new Intl.NumberFormat('en-US').format(absRaw);
    return `${isNegative ? '-' : ''}${formattedWhole}`;
  }

  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = absRaw / divisor;
  const fraction = absRaw % divisor;

  const formattedWhole = new Intl.NumberFormat('en-US').format(whole);
  const fracStr = fraction.toString().padStart(decimals, '0');

  return `${isNegative ? '-' : ''}${formattedWhole}.${fracStr}`;
}
