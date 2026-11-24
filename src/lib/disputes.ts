/**
 * Beneficiary dispute resolution (#907).
 *
 * A beneficiary (or the will owner) can file a dispute against a will, attach
 * evidence, and — once a reviewer has decided — appeal the decision once.
 * This module holds the state machine and the validation rules; the API routes
 * under `src/app/api/disputes/*` persist the records and the UI under
 * `src/app/disputes/*` drives it.
 */

export type DisputeStatus =
  | 'filed'
  | 'under_review'
  | 'resolved'
  | 'appealed'
  | 'closed';

export type DisputeOutcome = 'upheld' | 'rejected';

export type DisputeRole = 'beneficiary' | 'owner';

export interface DisputeEvidence {
  id: string;
  /** Short label, e.g. "Bank statement". */
  title: string;
  /** The evidence itself: a URL or a free-text statement. */
  content: string;
  submittedBy: string;
  submittedAt: string;
}

export interface DisputeDecision {
  outcome: DisputeOutcome;
  /** Reviewer's explanation, shown to both parties. */
  rationale: string;
  reviewer: string;
  decidedAt: string;
}

export interface DisputeAppeal {
  reason: string;
  submittedBy: string;
  submittedAt: string;
}

export interface Dispute {
  id: string;
  willId: string;
  /** Stellar account of the person who filed the dispute. */
  filedBy: string;
  /** Stellar account of the will owner, the other party to the dispute. */
  owner: string;
  role: DisputeRole;
  /** What the dispute is about. */
  reason: string;
  status: DisputeStatus;
  evidence: DisputeEvidence[];
  decision?: DisputeDecision;
  appeal?: DisputeAppeal;
  createdAt: string;
  updatedAt: string;
}

export const DISPUTE_REASON_MAX_LENGTH = 2_000;
export const DISPUTE_EVIDENCE_TITLE_MAX_LENGTH = 120;
export const DISPUTE_EVIDENCE_MAX_LENGTH = 2_000;
export const DISPUTE_EVIDENCE_MAX_ITEMS = 10;
export const DISPUTE_APPEAL_MAX_LENGTH = 2_000;

/** Statuses in which new evidence may still be submitted. */
const EVIDENCE_OPEN_STATUSES: readonly DisputeStatus[] = ['filed', 'under_review', 'appealed'];

/** Statuses a reviewer may move a dispute out of. */
const REVIEWABLE_STATUSES: readonly DisputeStatus[] = ['filed', 'under_review', 'appealed'];

export function isDisputeStatus(value: unknown): value is DisputeStatus {
  return (
    value === 'filed' ||
    value === 'under_review' ||
    value === 'resolved' ||
    value === 'appealed' ||
    value === 'closed'
  );
}

export function isDisputeOutcome(value: unknown): value is DisputeOutcome {
  return value === 'upheld' || value === 'rejected';
}

export function isDisputeRole(value: unknown): value is DisputeRole {
  return value === 'beneficiary' || value === 'owner';
}

/** A trimmed, non-empty string within `max` characters, or `null`. */
export function readBoundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function canSubmitEvidence(dispute: Dispute): boolean {
  return (
    EVIDENCE_OPEN_STATUSES.includes(dispute.status) &&
    dispute.evidence.length < DISPUTE_EVIDENCE_MAX_ITEMS
  );
}

export function canReview(dispute: Dispute): boolean {
  return REVIEWABLE_STATUSES.includes(dispute.status);
}

/** An appeal is allowed once, after a decision, and only by a party to the dispute. */
export function canAppeal(dispute: Dispute, appellant: string): boolean {
  return (
    dispute.status === 'resolved' &&
    Boolean(dispute.decision) &&
    !dispute.appeal &&
    isParty(dispute, appellant)
  );
}

/** True when `account` filed the dispute or is the owner of the will it concerns. */
export function isParty(dispute: Dispute, account: string): boolean {
  return account === dispute.filedBy || account === dispute.owner;
}

export type DisputeTransition =
  | { ok: true; dispute: Dispute }
  | { ok: false; error: string };

function touch(dispute: Dispute, now: string): Dispute {
  return { ...dispute, updatedAt: now };
}

/** Moves a filed dispute into review. Idempotent while already under review. */
export function startReview(dispute: Dispute, now = new Date().toISOString()): DisputeTransition {
  if (dispute.status === 'under_review') return { ok: true, dispute };
  if (!canReview(dispute)) {
    return { ok: false, error: `A dispute that is ${dispute.status} cannot be reviewed.` };
  }
  return { ok: true, dispute: touch({ ...dispute, status: 'under_review' }, now) };
}

/** Records a reviewer's decision. */
export function resolveDispute(
  dispute: Dispute,
  decision: { outcome: DisputeOutcome; rationale: string; reviewer: string },
  now = new Date().toISOString(),
): DisputeTransition {
  if (!canReview(dispute)) {
    return { ok: false, error: `A dispute that is ${dispute.status} cannot be resolved.` };
  }
  const rationale = readBoundedText(decision.rationale, DISPUTE_REASON_MAX_LENGTH);
  if (!rationale) {
    return { ok: false, error: 'A rationale is required to resolve a dispute.' };
  }
  return {
    ok: true,
    dispute: touch(
      {
        ...dispute,
        status: 'resolved',
        decision: {
          outcome: decision.outcome,
          rationale,
          reviewer: decision.reviewer,
          decidedAt: now,
        },
      },
      now,
    ),
  };
}

/** Files an appeal against a resolved dispute. */
export function appealDispute(
  dispute: Dispute,
  appeal: { reason: string; submittedBy: string },
  now = new Date().toISOString(),
): DisputeTransition {
  if (!canAppeal(dispute, appeal.submittedBy)) {
    return {
      ok: false,
      error: 'Only the party who filed the dispute can appeal, once, after a decision.',
    };
  }
  const reason = readBoundedText(appeal.reason, DISPUTE_APPEAL_MAX_LENGTH);
  if (!reason) {
    return { ok: false, error: 'An appeal reason is required.' };
  }
  return {
    ok: true,
    dispute: touch(
      {
        ...dispute,
        status: 'appealed',
        appeal: { reason, submittedBy: appeal.submittedBy, submittedAt: now },
      },
      now,
    ),
  };
}

/** Closes a dispute after its appeal has been decided. */
export function closeDispute(dispute: Dispute, now = new Date().toISOString()): DisputeTransition {
  if (dispute.status !== 'appealed') {
    return { ok: false, error: 'Only an appealed dispute can be closed.' };
  }
  return { ok: true, dispute: touch({ ...dispute, status: 'closed' }, now) };
}

/** Appends an evidence item, enforcing the open-status and item-count rules. */
export function addEvidence(
  dispute: Dispute,
  evidence: { title: string; content: string; submittedBy: string },
  now = new Date().toISOString(),
): DisputeTransition {
  if (!canSubmitEvidence(dispute)) {
    return {
      ok: false,
      error: `Evidence cannot be added to a dispute that is ${dispute.status}.`,
    };
  }
  const title = readBoundedText(evidence.title, DISPUTE_EVIDENCE_TITLE_MAX_LENGTH);
  const content = readBoundedText(evidence.content, DISPUTE_EVIDENCE_MAX_LENGTH);
  if (!title || !content) {
    return { ok: false, error: 'Evidence needs a title and content.' };
  }
  const item: DisputeEvidence = {
    id: crypto.randomUUID(),
    title,
    content,
    submittedBy: evidence.submittedBy,
    submittedAt: now,
  };
  return {
    ok: true,
    dispute: touch({ ...dispute, evidence: [...dispute.evidence, item] }, now),
  };
}

/** Creates a new dispute in the `filed` state. */
export function createDispute(input: {
  willId: string;
  filedBy: string;
  role: DisputeRole;
  reason: string;
  now?: string;
}): DisputeTransition {
  const reason = readBoundedText(input.reason, DISPUTE_REASON_MAX_LENGTH);
  if (!reason) {
    return { ok: false, error: 'A dispute reason is required.' };
  }
  const now = input.now ?? new Date().toISOString();
  return {
    ok: true,
    dispute: {
      id: crypto.randomUUID(),
      willId: input.willId,
      filedBy: input.filedBy,
      role: input.role,
      reason,
      status: 'filed',
      evidence: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}
