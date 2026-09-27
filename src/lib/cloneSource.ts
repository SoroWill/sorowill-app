import type { Will } from '@sorowill/sdk';

import { isWillNotFoundError } from './errors';

/**
 * Clone-source validation for the dashboard's "duplicate will" flow (issue #441).
 *
 * `?cloneFrom=<id>` used to hand the id straight to `getWill()` inside the new-will
 * page and, whatever came back, the form was filled in and the user could carry on
 * towards creating a will. A source that no longer exists, that the connected
 * wallet is not part of, or that simply could not be fetched all collapsed into one
 * generic error — and the form still opened.
 *
 * This module turns a clone attempt into an explicit result: either the source will
 * (safe to copy from) or a typed failure with the message the user should see. The
 * page can then refuse to start the clone instead of pretending it worked.
 */

export type CloneSourceFailureKind = 'access' | 'not-found' | 'network';

export interface CloneSourceSuccess {
  ok: true;
  will: Will;
}

export interface CloneSourceFailure {
  ok: false;
  kind: CloneSourceFailureKind;
  message: string;
}

export type CloneSourceResult = CloneSourceSuccess | CloneSourceFailure;

/** User-facing copy for each failure mode (issue #441 acceptance criteria). */
export const CLONE_SOURCE_MESSAGES = {
  access: 'You no longer have access to this will',
  'not-found': 'Will has been deleted',
  network: 'Unable to fetch will — try again',
} as const satisfies Record<CloneSourceFailureKind, string>;

const ACCESS_PATTERNS = [
  'unauthorized',
  'permission',
  'forbidden',
  'access denied',
  'not the owner',
  'not owner',
  'not a beneficiary',
  'not a guardian',
  'not guardian',
  'error(contract, #3)',
];

/** True when the error means "you may not see this will", not "it is gone". */
export function isAccessErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return ACCESS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Maps a thrown value to one of the three failure modes. Not-found wins over
 * access because a deleted will often surfaces as a contract error that also
 * mentions a permission failure.
 */
export function classifyCloneSourceError(error: unknown): CloneSourceFailureKind {
  if (isWillNotFoundError(error)) return 'not-found';

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (message && isAccessErrorMessage(message)) return 'access';

  return 'network';
}

/**
 * Whether `viewer` is allowed to copy settings out of this will: the owner, a
 * named beneficiary or a guardian. Without a connected wallet we cannot check
 * anything, so the caller's own wallet-connection gate stays in charge.
 */
export function hasCloneAccess(will: Will, viewer: string | null | undefined): boolean {
  const address = viewer?.trim();
  if (!address) return true;

  return (
    will.owner === address ||
    will.beneficiaries.some((beneficiary) => beneficiary.address === address) ||
    will.guardians.includes(address)
  );
}

/**
 * Fetches the clone source and validates access to it. Never throws: every
 * outcome is reported as a result so the page can show the right message.
 *
 * @param fetchWill - how to read a will (usually `client.getWill`)
 * @param willId - the `cloneFrom` id from the URL
 * @param viewer - the connected wallet, if any
 */
export async function loadCloneSource(
  fetchWill: (willId: string) => Promise<Will>,
  willId: string,
  viewer?: string | null,
): Promise<CloneSourceResult> {
  const id = willId?.trim();
  if (!id) {
    return { ok: false, kind: 'not-found', message: CLONE_SOURCE_MESSAGES['not-found'] };
  }

  let will: Will;
  try {
    will = await fetchWill(id);
  } catch (error) {
    const kind = classifyCloneSourceError(error);
    return { ok: false, kind, message: CLONE_SOURCE_MESSAGES[kind] };
  }

  if (!hasCloneAccess(will, viewer)) {
    return { ok: false, kind: 'access', message: CLONE_SOURCE_MESSAGES.access };
  }

  return { ok: true, will };
}
