import {
  getTokenDecimals,
  formatTokenBalance,
  getDecimalsCacheKey,
  clearTokenDecimalsCache,
  setCachedTokenDecimals,
} from '@/lib/tokenDecimals';

describe('getTokenDecimals & network caching (#448)', () => {
  beforeEach(() => {
    clearTokenDecimalsCache();
  });

  it('resolves testnet USDC to 6 decimals', () => {
    const testnetUsdc = 'CCW67HTGNFMXKFGRR2MKRB2V6DNFGBLXJOFKLDLNOICL5UX4YK7CPLAA';
    expect(getTokenDecimals(testnetUsdc, 'testnet')).toBe(6);
    expect(getTokenDecimals(testnetUsdc.toLowerCase(), 'testnet')).toBe(6);
  });

  it('includes network identifier in the cache key', () => {
    const contract = 'CBWNTC2C7Z6G6XGLK4M2I6VVRCPZKVHOUBFF6V5V4J3PQ7ZZZZZZZZZZ';
    const testnetKey = getDecimalsCacheKey('testnet', contract);
    const mainnetKey = getDecimalsCacheKey('mainnet', contract);

    expect(testnetKey).toBe(`testnet-${contract.toLowerCase()}`);
    expect(mainnetKey).toBe(`mainnet-${contract.toLowerCase()}`);
    expect(testnetKey).not.toBe(mainnetKey);
  });

  it('resolves different decimals on each network for the same contract address', () => {
    const sharedContract = 'CDLZFC3GG5H6HZH5G5G5GBDNHZDPZPZFQ3A7P4XF2HQFPZPZFQ3A7P4A';
    setCachedTokenDecimals(sharedContract, 6, 'testnet');
    setCachedTokenDecimals(sharedContract, 18, 'mainnet');

    expect(getTokenDecimals(sharedContract, 'testnet')).toBe(6);
    expect(getTokenDecimals(sharedContract, 'mainnet')).toBe(18);
  });

  it('clears cache and fetches fresh values when clearTokenDecimalsCache is invoked', () => {
    const contract = 'CDLZFC3GG5H6HZH5G5G5GBDNHZDPZPZFQ3A7P4XF2HQFPZPZFQ3A7P4A';
    setCachedTokenDecimals(contract, 12, 'testnet');
    expect(getTokenDecimals(contract, 'testnet')).toBe(12);

    clearTokenDecimalsCache();
    // After clearing, falls back to standard registry / default decimals
    expect(getTokenDecimals(contract, 'testnet')).toBe(7);
  });

  it('falls back to 7 decimals for unrecognised token contract addresses', () => {
    const unknownToken = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
    expect(getTokenDecimals(unknownToken, 'testnet')).toBe(7);
  });
});

describe('formatTokenBalance precision and formatting', () => {
  it('preserves exact precision for balances larger than MAX_SAFE_INTEGER without parseFloat rounding', () => {
    // 9,007,199,254,740,993 > Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)
    // 9007199254740993000000 base units at 6 decimals = 9,007,199,254,740,993.000000
    const hugeBalance = '9007199254740993000000';
    const formatted = formatTokenBalance(hugeBalance, 'any', 6);
    expect(formatted).toBe('9,007,199,254,740,993.000000');
  });

  it('formats 7-decimal balances with exact fractional digits', () => {
    const balance = '12345678901'; // 1,234.5678901
    expect(formatTokenBalance(balance, 'any', 7)).toBe('1,234.5678901');
  });

  it('formats zero balance correctly without NaN or formatting artifacts', () => {
    expect(formatTokenBalance('0', 'any', 6)).toBe('0.000000');
    expect(formatTokenBalance(0n, 'any', 7)).toBe('0.0000000');
  });

  it('handles negative balances correctly', () => {
    expect(formatTokenBalance('-1000000', 'any', 6)).toBe('-1.000000');
    expect(formatTokenBalance(-500000n, 'any', 6)).toBe('-0.500000');
  });

  it('handles 0 decimals gracefully', () => {
    expect(formatTokenBalance('1234', 'any', 0)).toBe('1,234');
    expect(formatTokenBalance('-1234', 'any', 0)).toBe('-1,234');
  });
});
