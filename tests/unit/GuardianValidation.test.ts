import { describe, it, expect } from 'vitest';
import { validateGuardians, isValidStellarAddress } from '@/lib/guardianValidation';
import { MAX_GUARDIANS } from '@/lib/constants';

// Real Stellar account addresses (checksum-valid, generated via @stellar/stellar-sdk).
// These are NOT funded accounts — they are test-only public keys.
const VALID_ADDR_1 = 'GBRT6OQL3NICNKX6FFDVAZ36IABM5EB7HDNRPQ4QEMK4TJAUUMFYNFXB';
const VALID_ADDR_2 = 'GDMALMOLFTCHCB74BAEZLLXFXQK57JE4BTFS2C3WJGSVF4637PRHII5S';
const VALID_ADDR_3 = 'GBH5PLTFCGH2HKKW6H5FGRU76X776QIYCKCJA4N2IG7TVNGAGHLMTVH3';
const VALID_ADDR_4 = 'GBOGL2ZKSKUGL3LVYA26Q55AXGRVUKAPG7YP3YHMW6KR2KISTDBWMUAV';

// Addresses used for over-limit test (MAX_GUARDIANS + 1 entries)
const OVER_LIMIT_GUARDIANS = [
  VALID_ADDR_1,
  VALID_ADDR_2,
  VALID_ADDR_3,
  VALID_ADDR_4,
];

// A Stellar address that is regex-valid (starts with G, 56 base32 chars) but
// has a corrupted checksum (one character altered at position 10).
const CHECKSUM_INVALID_ADDR = 'GBRT6OQL3NJCNKX6FFDVAZ36IABM5EB7HDNRPQ4QEMK4TJAUUMFYNFXB';

// ─────────────────────────────────────────────────────────────────────────────
// #239 — isValidStellarAddress checksum validation
// ─────────────────────────────────────────────────────────────────────────────
describe('isValidStellarAddress — CRC16 checksum (#239)', () => {
  it('accepts a real, checksum-valid Stellar address', () => {
    expect(isValidStellarAddress(VALID_ADDR_1)).toBe(true);
    expect(isValidStellarAddress(VALID_ADDR_2)).toBe(true);
    expect(isValidStellarAddress(VALID_ADDR_3)).toBe(true);
  });

  it('rejects a format-valid but checksum-invalid address (one char altered)', () => {
    // The modified address still matches /^G[A-Z2-7]{55}$/ but its CRC16 is wrong.
    expect(isValidStellarAddress(CHECKSUM_INVALID_ADDR)).toBe(false);
  });

  it('rejects malformed addresses (wrong format)', () => {
    expect(isValidStellarAddress('')).toBe(false);
    expect(isValidStellarAddress('G')).toBe(false);
    expect(isValidStellarAddress('g'.repeat(56))).toBe(false);
    expect(isValidStellarAddress('GABCDEFG')).toBe(false);
    // Old-style repeated-char addresses are format-valid but checksum-invalid
    expect(isValidStellarAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #238 — MAX_GUARDIANS count enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('validateGuardians — MAX_GUARDIANS limit (#238)', () => {
  it('returns a topError when more than MAX_GUARDIANS valid addresses are provided', () => {
    // OVER_LIMIT_GUARDIANS has MAX_GUARDIANS + 1 entries (4 when MAX is 3)
    expect(OVER_LIMIT_GUARDIANS.length).toBe(MAX_GUARDIANS + 1);

    const { topError } = validateGuardians(OVER_LIMIT_GUARDIANS, null);
    expect(topError).not.toBeNull();
    expect(topError).toMatch(/at most/i);
    expect(topError).toContain(String(MAX_GUARDIANS));
  });

  it('allows exactly MAX_GUARDIANS valid addresses', () => {
    const exactLimit = [VALID_ADDR_1, VALID_ADDR_2, VALID_ADDR_3].slice(0, MAX_GUARDIANS);
    const { topError } = validateGuardians(exactLimit, null);
    expect(topError).toBeNull();
  });

  it('does not count empty rows toward the limit', () => {
    const withBlanks = [VALID_ADDR_1, '', VALID_ADDR_2, '', VALID_ADDR_3];
    const { topError } = validateGuardians(withBlanks, null);
    expect(topError).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate detection (unchanged behaviour)
// ─────────────────────────────────────────────────────────────────────────────
describe('validateGuardians — Duplicate Detection', () => {
  it('detects duplicate guardian addresses in the same will', () => {
    const guardians = [VALID_ADDR_1, VALID_ADDR_1, VALID_ADDR_2];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[0]).toBe('');
    expect(rowErrors[1]).toBe('Duplicate guardian address');
    expect(rowErrors[2]).toBe('');
    expect(topError).toBe('Please fix the guardian address errors above before continuing.');
  });

  it('allows unique guardian addresses without errors', () => {
    const guardians = [VALID_ADDR_1, VALID_ADDR_2, VALID_ADDR_3];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[0]).toBe('');
    expect(rowErrors[1]).toBe('');
    expect(rowErrors[2]).toBe('');
    expect(topError).toBeNull();
  });

  it('ignores whitespace when detecting duplicates', () => {
    const guardians = [VALID_ADDR_1, ` ${VALID_ADDR_1} `, VALID_ADDR_2];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[0]).toBe('');
    expect(rowErrors[1]).toBe('Duplicate guardian address');
    expect(topError).not.toBeNull();
  });

  it('handles empty rows correctly when checking for duplicates', () => {
    const guardians = [VALID_ADDR_1, '', VALID_ADDR_1];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[1]).toBe('');
    expect(rowErrors[2]).toBe('Duplicate guardian address');
    expect(topError).not.toBeNull();
  });

  it('detects multiple duplicates in one list', () => {
    const guardians = [VALID_ADDR_1, VALID_ADDR_1, VALID_ADDR_2, VALID_ADDR_2];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[0]).toBe('');
    expect(rowErrors[1]).toBe('Duplicate guardian address');
    expect(rowErrors[2]).toBe('');
    expect(rowErrors[3]).toBe('Duplicate guardian address');
    expect(topError).not.toBeNull();
  });

  it('sets top-level error message when duplicates are found', () => {
    const guardians = [VALID_ADDR_1, VALID_ADDR_1];
    const { topError } = validateGuardians(guardians, null);

    expect(topError).toBe('Please fix the guardian address errors above before continuing.');
  });

  it('returns no error when guardians list is empty or has only one guardian', () => {
    const { topError: topError1 } = validateGuardians([], null);
    expect(topError1).toBeNull();

    const { topError: topError2 } = validateGuardians([VALID_ADDR_1], null);
    expect(topError2).toBeNull();
  });

  it('flags invalid addresses before checking for duplicates', () => {
    const invalidAddr = 'INVALID_ADDRESS_1234567890';
    const guardians = [invalidAddr, invalidAddr];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[0]).toBe('Not a valid Stellar address (must start with G and be 56 characters)');
    expect(rowErrors[1]).toBe('Not a valid Stellar address (must start with G and be 56 characters)');
    expect(topError).not.toBeNull();
  });

  it('detects duplicate that is also the owner address', () => {
    const ownerAddress = VALID_ADDR_1;
    const guardians = [VALID_ADDR_1, VALID_ADDR_2];
    const { rowErrors, topError } = validateGuardians(guardians, ownerAddress);

    expect(rowErrors[0]).toBe('A guardian cannot be the same as the will owner');
    expect(rowErrors[1]).toBe('');
    expect(topError).not.toBeNull();
  });

  it('detects all three slots filled with same address', () => {
    const guardians = [VALID_ADDR_1, VALID_ADDR_1, VALID_ADDR_1];
    const { rowErrors, topError } = validateGuardians(guardians, null);

    expect(rowErrors[0]).toBe('');
    expect(rowErrors[1]).toBe('Duplicate guardian address');
    expect(rowErrors[2]).toBe('Duplicate guardian address');
    expect(topError).not.toBeNull();
  });

  it('only returns top-level error when there are actual errors', () => {
    const guardians = [VALID_ADDR_1, ''];
    const { topError } = validateGuardians(guardians, null);

    expect(topError).toBeNull();
  });
});
