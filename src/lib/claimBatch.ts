import { calculateShares, type Will } from '@sorowill/sdk';

/** Per-beneficiary outcome of a batched claim. */
export type ClaimStatus = 'pending' | 'claimed' | 'failed';

export interface ClaimEntry {
  address: string;
  /** Share in stroops, as returned by `calculateShares`. */
  share: string;
  status: ClaimStatus;
  /** Transaction hash that paid this beneficiary, when known. */
  txHash?: string;
  /** Human-readable failure reason, when `status === 'failed'`. */
  error?: string;
}

/**
 * How a batch is settled:
 * - `atomic`: every claim lands in one transaction — all succeed or none do.
 * - `best-effort`: claims are attempted individually; failures don't block the rest.
 */
export type ClaimMode = 'atomic' | 'best-effort';

export interface ClaimBatchResult {
  mode: ClaimMode;
  entries: ClaimEntry[];
  /** Transaction hash of the single batch transaction (atomic mode). */
  txHash?: string;
  /** True when every entry ended up `claimed`. */
  allClaimed: boolean;
}

/** Builds the initial, all-pending status list for a will's beneficiaries. */
export function buildClaimEntries(will: Will): ClaimEntry[] {
  return calculateShares(will.balance, will.beneficiaries).map((row) => ({
    address: row.address,
    share: String(row.share),
    status: 'pending' as ClaimStatus,
  }));
}

/**
 * Applies a batch outcome to the status list.
 *
 * In atomic mode a single transaction covers every beneficiary, so the
 * transaction hash and any error are fanned out to all entries.
 */
export function applyBatchResult(
  entries: ClaimEntry[],
  result: { mode: ClaimMode; txHash?: string; error?: string },
): ClaimEntry[] {
  if (result.mode === 'atomic') {
    const status: ClaimStatus = result.error ? 'failed' : 'claimed';
    return entries.map((entry) => ({
      ...entry,
      status,
      txHash: result.error ? undefined : result.txHash,
      error: result.error,
    }));
  }
  return entries;
}

/** Marks a single beneficiary as claimed or failed (best-effort mode). */
export function applyIndividualResult(
  entries: ClaimEntry[],
  address: string,
  result: { txHash?: string; error?: string },
): ClaimEntry[] {
  return entries.map((entry) =>
    entry.address === address
      ? {
          ...entry,
          status: result.error ? 'failed' : 'claimed',
          txHash: result.error ? undefined : result.txHash,
          error: result.error,
        }
      : entry,
  );
}

/** Counts entries by status, for summary display. */
export function summarizeClaims(entries: ClaimEntry[]): Record<ClaimStatus, number> {
  return entries.reduce<Record<ClaimStatus, number>>(
    (acc, entry) => ({ ...acc, [entry.status]: acc[entry.status] + 1 }),
    { pending: 0, claimed: 0, failed: 0 },
  );
}
