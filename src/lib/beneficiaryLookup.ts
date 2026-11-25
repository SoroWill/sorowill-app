/**
 * Helpers for the beneficiary lookup page (issue #876): find the wills a
 * Stellar address is a beneficiary of, page through the results, and build the
 * link that lets the beneficiary claim.
 *
 * The filtering and pagination live here, away from the page component, so
 * they can be unit tested without a browser or an RPC connection.
 */
import type { Will } from '@sorowill/sdk';

/** Wills shown per page on the lookup page. */
export const BENEFICIARY_PAGE_SIZE = 6;

export interface BeneficiaryPage {
  /** Wills on the requested page, already sliced. */
  items: Will[];
  /** 1-based page number actually returned (clamped to the available range). */
  page: number;
  /** Total number of pages; at least 1 even when there are no results. */
  totalPages: number;
  /** Total number of matching wills across all pages. */
  total: number;
  /** 1-based index of the first item on this page, or 0 when there are none. */
  from: number;
  /** 1-based index of the last item on this page, or 0 when there are none. */
  to: number;
}

/** A Stellar account address, which is what a will stores for a beneficiary. */
export const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/;

/**
 * Canonicalises an address typed or pasted into the lookup box: trims it and
 * uppercases it. Stellar addresses are case-sensitive base32, so anything not
 * already uppercase is not a valid address, but normalising here keeps the
 * lookup forgiving of a lowercase paste before validation runs.
 */
export function normalizeLookupAddress(input: string): string {
  return input.trim().toUpperCase();
}

/** True when `input` (after normalisation) is a well-formed Stellar account address. */
export function isValidLookupAddress(input: string): boolean {
  return STELLAR_ACCOUNT_RE.test(normalizeLookupAddress(input));
}

/**
 * Returns the wills that list `address` as a beneficiary.
 *
 * The order returned by the chain scan is preserved, so the newest results
 * (lower will IDs are older, but callers see a stable order) can be paged
 * deterministically.
 */
export function findWillsForBeneficiary(wills: Will[], address: string): Will[] {
  const needle = normalizeLookupAddress(address);
  if (!needle) return [];
  return wills.filter((will) =>
    (will.beneficiaries ?? []).some(
      (beneficiary) => normalizeLookupAddress(beneficiary.address) === needle,
    ),
  );
}

/** The beneficiary's percentage share of a will, or `null` when they are not listed. */
export function beneficiaryShareOf(will: Will, address: string): number | null {
  const needle = normalizeLookupAddress(address);
  const match = (will.beneficiaries ?? []).find(
    (beneficiary) => normalizeLookupAddress(beneficiary.address) === needle,
  );
  return match ? match.percentage : null;
}

/**
 * Slices matching wills into a page.
 *
 * Out-of-range page numbers are clamped rather than returning an empty page,
 * so a stale `?page=` value or a shrink in results still shows something
 * useful. `totalPages` is never below 1, which keeps the UI's "page N of M"
 * readable when there are no matches.
 */
export function paginateWills(
  wills: Will[],
  page: number,
  pageSize: number = BENEFICIARY_PAGE_SIZE,
): BeneficiaryPage {
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : BENEFICIARY_PAGE_SIZE;
  const total = wills.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const current = Math.min(Math.max(1, requested), totalPages);
  const start = (current - 1) * size;
  const items = wills.slice(start, start + size);

  return {
    items,
    page: current,
    totalPages,
    total,
    from: items.length ? start + 1 : 0,
    to: items.length ? start + items.length : 0,
  };
}

/** The route that lets a beneficiary review and claim a will. */
export function claimHref(willId: string): string {
  return `/inherit/${encodeURIComponent(willId)}`;
}
