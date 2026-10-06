import { describe, it, expect, vi } from 'vitest';
import type { Will } from '@sorowill/sdk';

vi.mock('react', () => ({
  cache: (fn: Function) => fn,
}));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({}),
  getNetwork: () => 'testnet',
}));

import { buildWillMetadataDescription } from '@/lib/willMetadata';

// A valid-shaped Stellar contract ID: 'C' + 55 base32 chars.
// Testnet USDC — must be in TOKEN_DECIMALS_REGISTRY with 6 decimals.
const USDC_TOKEN = 'CCW67HTGNFMXKFGRR2MKRB2V6DNFGBLXJOFKLDLNOICL5UX4YK7CPLAA';
// An unknown contract ID — falls back to DEFAULT_DECIMALS (7).
const UNKNOWN_TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: '1',
    status: 'Active',
    // 1,234.5678901 in 7-decimal base units (1_234_567_8901n).
    balance: '12345678901',
    token: UNKNOWN_TOKEN,
    beneficiaries: [
      { address: 'GBBD47UZQ5VOHF4AKOA7CMM7SVQE6AKMOUIVJGN7BQHMPUYKUUY7BK43', percentage: 100 },
    ],
    ...overrides,
  } as unknown as Will;
}

describe('buildWillMetadataDescription (#348)', () => {
  it('uses the registry decimals for a known 6-decimal token (USDC)', () => {
    const will = makeWill({
      token: USDC_TOKEN,
      // 123.450000 in 6-decimal base units.
      balance: '123450000',
    });

    const description = buildWillMetadataDescription(will);

    expect(description).toContain('123.450000');
    expect(description).not.toContain('USDC');
  });

  it('uses 7 decimals for an unknown token and does not mislabel it as USDC', () => {
    const will = makeWill({
      token: UNKNOWN_TOKEN,
      // 1,234.5678901 in 7-decimal base units.
      balance: '12345678901',
    });

    const description = buildWillMetadataDescription(will);

    expect(description).toContain('1,234.5678901');
    expect(description).not.toContain('USDC');
  });

  it('preserves precision for balances larger than Number.MAX_SAFE_INTEGER', () => {
    const will = makeWill({
      token: USDC_TOKEN,
      // 9,007,199,254,740,993.000000 in 6-decimal base units.
      // Number() would round this to ...992.
      balance: '9007199254740993000000',
    });

    const description = buildWillMetadataDescription(will);

    expect(description).toContain('9,007,199,254,740,993.000000');
    expect(description).not.toContain('9,007,199,254,740,992');
  });

  it('includes status and beneficiary count in a stable format', () => {
    const will = makeWill({
      status: 'Triggered',
      beneficiaries: [
        { address: 'GBBD47UZQ5VOHF4AKOA7CMM7SVQE6AKMOUIVJGN7BQHMPUYKUUY7BK43', percentage: 50 },
        { address: 'GCZST3WHSPDTQK37QWFC3KXZK5OJJ53FUWZPAB5XGTK47ZD5PTJUWQXI', percentage: 50 },
      ],
      balance: '10000000',
      token: UNKNOWN_TOKEN,
    });

    const description = buildWillMetadataDescription(will);

    expect(description).toBe(
      'Status: Triggered. Locked balance: 1.0000000. 2 beneficiaries.',
    );
  });
});
