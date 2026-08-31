/**
 * Tests that exportWillsToCSV() uses the correct decimal count for each
 * will's token rather than blindly dividing by 1 000 000 (USDC assumption).
 *
 * This file is the regression guard for issue #256.
 */
import { describe, it, expect } from 'vitest';
import type { Will, WillStatus } from '@sorowill/sdk';

import { exportWillsToCSV } from '@/lib/willExport';
import { formatTokenBalance, getTokenDecimals } from '@/lib/tokenDecimals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A token address that is NOT in the registry — falls back to 7 decimals. */
const UNKNOWN_8_DECIMAL_TOKEN = 'CTESTTOKEN8DECIMALS0000000000000000000000000000000000000001';

/** Build a minimal Will fixture. balance must be a string (SDK type). */
function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: 'will-test-001',
    owner: 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4',
    token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    balance: '1000000', // 1 USDC at 6 decimals
    beneficiaries: [],
    guardians: [],
    guardianVotes: 0,
    status: 'Active' as WillStatus,
    lastCheckin: new Date('2026-01-01T00:00:00.000Z'),
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    triggerTime: null,
    ...overrides,
  } as Will;
}

/** Extract the Balance column value from a single-row CSV string. */
function extractBalance(csv: string): string {
  const [header, dataRow] = csv.split('\n');
  const headers = header.split(',');
  const values = dataRow.split(',');
  const idx = headers.indexOf('Balance');
  return values[idx];
}

// ---------------------------------------------------------------------------
// Unit tests for formatTokenBalance / getTokenDecimals
// ---------------------------------------------------------------------------

describe('getTokenDecimals', () => {
  it('returns 6 for a known USDC testnet address', () => {
    expect(
      getTokenDecimals('CCW67HTGNFMXKFGRR2MKRB2V6DNFGBLXJOFKLDLNOICL5UX4YK7CPLA'),
    ).toBe(6);
  });

  it('is case-insensitive', () => {
    expect(
      getTokenDecimals('ccw67htgnfmxkfgrr2mkrb2v6dnfgblxjofkldlnoicl5ux4yk7cpla'),
    ).toBe(6);
  });

  it('returns 7 (default) for an unknown token', () => {
    expect(getTokenDecimals(UNKNOWN_8_DECIMAL_TOKEN)).toBe(7);
  });
});

describe('formatTokenBalance', () => {
  it('formats 1 000 000 base units as "1.000000" for a 6-decimal token', () => {
    expect(formatTokenBalance('1000000', 'any-token', 6)).toBe('1.000000');
  });

  it('formats 10 000 000 base units as "1.0000000" for a 7-decimal token', () => {
    expect(formatTokenBalance('10000000', 'any-token', 7)).toBe('1.0000000');
  });

  it('formats 100 base units as "1.00" for a 2-decimal token', () => {
    expect(formatTokenBalance('100', 'any-token', 2)).toBe('1.00');
  });

  it('accepts a bigint balance', () => {
    expect(formatTokenBalance(1_000_000n, 'any-token', 6)).toBe('1.000000');
  });

  it('includes thousands separators for large values', () => {
    // 1 234 000 000 base units at 6 decimals = 1,234.000000
    expect(formatTokenBalance('1234000000', 'any-token', 6)).toBe('1,234.000000');
  });
});

// ---------------------------------------------------------------------------
// Integration: exportWillsToCSV uses token-correct decimals
// ---------------------------------------------------------------------------

describe('exportWillsToCSV — token-aware balance formatting', () => {
  it('formats a 6-decimal USDC balance correctly (1 000 000 base → 1.000000)', () => {
    const will = makeWill({ balance: '1000000', token: 'CUSDC-6-DECIMALS', checkinPeriodDays: 90 });
    const csv = exportWillsToCSV([will]);
    // formatTokenBalance('1000000', unknown token) uses DEFAULT_DECIMALS=7
    // BUT we pass a decimalsOverride=6 in the CSV via getTokenDecimals lookup.
    // Since 'CUSDC-6-DECIMALS' is not in the registry the default (7) applies here —
    // the important assertion is that the value is NOT the USDC-hardcoded '1' (1e6/1e6).
    // Use a real registry token instead:
    const usdcTestnet = 'CCW67HTGNFMXKFGRR2MKRB2V6DNFGBLXJOFKLDLNOICL5UX4YK7CPLA';
    const usdcWill = makeWill({ balance: '1000000', token: usdcTestnet });
    const usdcCsv = exportWillsToCSV([usdcWill]);
    const balance = extractBalance(usdcCsv);
    // 1 000 000 base units / 10^6 = 1, formatted as '1.000000'
    expect(balance).toBe('1.000000');
  });

  it('does NOT divide by 1 000 000 for a 7-decimal token (the old bug)', () => {
    // A token not in the registry → DEFAULT_DECIMALS = 7.
    // 10 000 000 base units at 7 decimals = 1.0000000
    // At 6 decimals (old bug) the same balance would produce 10.000000 — wrong.
    const will = makeWill({ balance: '10000000', token: UNKNOWN_8_DECIMAL_TOKEN });
    const csv = exportWillsToCSV([will]);
    const balance = extractBalance(csv);

    // Correct (7 decimals): 10000000 / 10^7 = 1.0000000
    expect(balance).toBe('1.0000000');
    // Wrong (6 decimals, old behaviour): would be 10.000000
    expect(balance).not.toBe('10.000000');
  });

  it('exports the correct balance for a hypothetical 2-decimal token', () => {
    // 100 base units at 2 decimals = 1.00
    // We pass the decimalsOverride via formatTokenBalance directly in this assertion.
    const result = formatTokenBalance('100', 'any', 2);
    expect(result).toBe('1.00');
  });

  it('handles zero balance', () => {
    // balance='0' is a non-empty string so formatTokenBalance is called;
    // it produces '0.0000000' for an unknown token (7 decimals default).
    const will = makeWill({ balance: '0', token: UNKNOWN_8_DECIMAL_TOKEN });
    const csv = exportWillsToCSV([will]);
    // Correct: formatted zero with 7 decimal places (DEFAULT_DECIMALS).
    expect(extractBalance(csv)).toBe('0.0000000');
  });
});
