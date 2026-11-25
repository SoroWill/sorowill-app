import { describe, expect, it } from 'vitest';
import type { Will } from '@sorowill/sdk';

import {
  BENEFICIARY_PAGE_SIZE,
  beneficiaryShareOf,
  claimHref,
  findWillsForBeneficiary,
  isValidLookupAddress,
  normalizeLookupAddress,
  paginateWills,
} from '@/lib/beneficiaryLookup';

const ALICE = `G${'A'.repeat(55)}`;
const BOB = `G${'B'.repeat(55)}`;

function makeWill(id: string, beneficiaries: { address: string; percentage: number }[]): Will {
  return {
    id,
    balance: '1000000',
    status: 'Active',
    beneficiaries,
  } as unknown as Will;
}

const wills = [
  makeWill('1', [{ address: ALICE, percentage: 60 }, { address: BOB, percentage: 40 }]),
  makeWill('2', [{ address: BOB, percentage: 100 }]),
  makeWill('3', [{ address: ALICE.toLowerCase().replace('g', 'G'), percentage: 25 }]),
  makeWill('4', []),
];

describe('beneficiary lookup helpers (#876)', () => {
  it('normalises addresses before comparing', () => {
    expect(normalizeLookupAddress('  gabc  ')).toBe('GABC');
  });

  it('validates Stellar account addresses', () => {
    expect(isValidLookupAddress(ALICE)).toBe(true);
    expect(isValidLookupAddress(`  ${ALICE}  `)).toBe(true);
    expect(isValidLookupAddress('G123')).toBe(false);
    expect(isValidLookupAddress('')).toBe(false);
  });

  it('finds every will naming the address, case-insensitively', () => {
    const ids = findWillsForBeneficiary(wills, ALICE).map((will) => will.id);
    expect(ids).toEqual(['1', '3']);
  });

  it('returns nothing for an empty address instead of matching every will', () => {
    expect(findWillsForBeneficiary(wills, '   ')).toEqual([]);
  });

  it('reports the beneficiary percentage for the matching will only', () => {
    expect(beneficiaryShareOf(wills[0], ALICE)).toBe(60);
    expect(beneficiaryShareOf(wills[1], ALICE)).toBeNull();
    expect(beneficiaryShareOf(wills[3], ALICE)).toBeNull();
  });

  it('builds the claim link for a will', () => {
    expect(claimHref('42')).toBe('/inherit/42');
  });
});

describe('paginateWills (#876)', () => {
  const many = Array.from({ length: 13 }, (_, i) => makeWill(String(i + 1), []));

  it('slices into pages and reports the range', () => {
    const page = paginateWills(many, 2, 5);
    expect(page.items.map((will) => will.id)).toEqual(['6', '7', '8', '9', '10']);
    expect(page).toMatchObject({ page: 2, totalPages: 3, total: 13, from: 6, to: 10 });
  });

  it('uses DEFAULT page size when none is given', () => {
    const page = paginateWills(many, 1);
    expect(page.items).toHaveLength(BENEFICIARY_PAGE_SIZE);
  });

  it('clamps a page below 1 and above the last page', () => {
    expect(paginateWills(many, 0, 5).page).toBe(1);
    expect(paginateWills(many, 99, 5).page).toBe(3);
    expect(paginateWills(many, 99, 5).items.at(-1)?.id).toBe('13');
  });

  it('reports one page for an empty result set', () => {
    const page = paginateWills([], 4);
    expect(page).toMatchObject({ items: [], page: 1, totalPages: 1, total: 0, from: 0, to: 0 });
  });

  it('falls back to the default page size when given a non-positive size', () => {
    expect(paginateWills(many, 1, 0).items).toHaveLength(BENEFICIARY_PAGE_SIZE);
    expect(paginateWills(many, 1, Number.NaN).items).toHaveLength(BENEFICIARY_PAGE_SIZE);
  });
});
