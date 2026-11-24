/**
 * Guardian co-signer workflow (#897).
 *
 * A will's early release needs `GUARDIAN_THRESHOLD` guardian signatures. This module turns the
 * raw guardian list plus the on-chain vote count into a per-signer status list, and tracks the
 * deadline by which the remaining guardians must co-sign before the request lapses.
 */

import { GUARDIAN_THRESHOLD } from './constants';

/** How long a guardian co-sign request stays open before it times out: 7 days. */
export const COSIGN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Inside this window the co-sign request is flagged as expiring soon. */
export const COSIGN_DUE_SOON_MS = 24 * 60 * 60 * 1000;

export type CoSignerStatus = 'signed' | 'pending' | 'expired';

export type CoSignPhase = 'collecting' | 'complete' | 'expired';

export interface CoSigner {
  address: string;
  status: CoSignerStatus;
}

export interface CoSignState {
  signers: CoSigner[];
  signedCount: number;
  requiredCount: number;
  /** Signatures still needed to reach the threshold (never negative). */
  remainingCount: number;
  phase: CoSignPhase;
  /** When the request lapses, or null when no request is open. */
  deadline: Date | null;
  /** Milliseconds left before the deadline (never negative). */
  msRemaining: number;
  /** True once the deadline has passed while signatures are still missing. */
  timedOut: boolean;
  /** True when the deadline is inside `COSIGN_DUE_SOON_MS` and signatures are still missing. */
  dueSoon: boolean;
}

/**
 * Builds the co-signer workflow state.
 *
 * `guardianVotes` is the number of signatures the contract has already recorded; those are
 * attributed to the first guardians in the list, which is the order the contract reports them in.
 * `requestedAt` is when the first guardian opened the co-sign request; without it no deadline is
 * tracked and the request never times out.
 */
export function getCoSignState(
  guardians: string[],
  guardianVotes: number,
  requestedAt: Date | null = null,
  now: Date = new Date(),
): CoSignState {
  const requiredCount = GUARDIAN_THRESHOLD;
  const signedCount = Math.max(0, Math.min(Math.floor(guardianVotes), guardians.length));
  const remainingCount = Math.max(0, requiredCount - signedCount);
  const complete = signedCount >= requiredCount;

  const deadline = requestedAt ? new Date(requestedAt.getTime() + COSIGN_WINDOW_MS) : null;
  const msRemaining = deadline ? Math.max(0, deadline.getTime() - now.getTime()) : 0;
  const timedOut = !complete && deadline !== null && msRemaining === 0;
  const dueSoon = !complete && !timedOut && deadline !== null && msRemaining <= COSIGN_DUE_SOON_MS;

  const phase: CoSignPhase = complete ? 'complete' : timedOut ? 'expired' : 'collecting';

  return {
    signers: guardians.map((address, index) => ({
      address,
      status: index < signedCount ? 'signed' : timedOut ? 'expired' : 'pending',
    })),
    signedCount,
    requiredCount,
    remainingCount,
    phase,
    deadline,
    msRemaining,
    timedOut,
    dueSoon,
  };
}

/** Human-readable next step for the workflow, used by the panel and its tests. */
export function describeCoSignPhase(state: CoSignState): string {
  switch (state.phase) {
    case 'complete':
      return 'Quorum reached — the early release can be executed.';
    case 'expired':
      return 'The co-sign request timed out. A guardian must start a new request.';
    default:
      return `Waiting for ${state.remainingCount} more guardian signature${state.remainingCount === 1 ? '' : 's'}.`;
  }
}
