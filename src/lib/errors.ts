import { NextResponse } from 'next/server';

/**
 * Shared check for whether an error message indicates the will does not
 * exist on chain (contract-level "will not found" / "WillNotFound", error
 * code #1). Used by every call site that needs to classify a "will not
 * found" condition so they stay consistent with one another.
 */
export function isWillNotFoundMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('willnotfound') ||
    msg.includes('no such will') ||
    msg.includes('does not exist') ||
    msg.includes('error(contract, #1)')
  );
}

export function isWillNotFoundError(error: unknown): boolean {
  return error instanceof Error && isWillNotFoundMessage(error.message);
}

const KNOWN_ERROR_PATTERNS: ReadonlyArray<{
  test: (message: string) => boolean;
  friendly: string;
}> = [
  // More specific patterns must come first so they are not masked by
  // broader patterns (e.g. "contract not found on the network" contains
  // "network", so it must be matched before the generic network pattern).
  {
    test: (message) =>
      message.toLowerCase().includes('contract') &&
      message.toLowerCase().includes('not found'),
    friendly: 'The smart contract could not be found on the network.',
  },
  {
    test: (message) => isWillNotFoundMessage(message),
    friendly: 'This will was not found on the blockchain.',
  },
  {
    test: (message) =>
      message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch'),
    friendly:
      'Unable to reach the blockchain network. Please check your connection and try again.',
  },
  {
    test: (message) => message.toLowerCase().includes('simulation'),
    friendly:
      'The transaction simulation failed. The will may no longer be in a state that allows this action.',
  },
  {
    test: (message) =>
      message.toLowerCase().includes('insufficient') ||
      message.toLowerCase().includes('balance'),
    friendly: 'There are not enough funds to complete this operation.',
  },
  {
    test: (message) => message.toLowerCase().includes('already voted'),
    friendly: "You've already cast a vote on this will.",
  },
  {
    test: (message) =>
      message.toLowerCase().includes('not a guardian') ||
      message.toLowerCase().includes('not guardian'),
    friendly:
      'You are not eligible to perform this action on this will.',
  },
  {
    test: (message) => message.toLowerCase().includes('unauthorized'),
    friendly:
      'You do not have permission to perform this action.',
  },
];

/**
 * Extracts a plain string message from any thrown value.
 *
 * The SDK (and the underlying Stellar RPC layer) does not guarantee that
 * thrown values are `Error` instances — it may throw plain objects
 * (`{ message: '...' }`), strings, or even `null`. This helper normalises
 * all of those shapes so the rest of `formatError` can work against a
 * single string.
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return '';
}

/**
 * The four distinct failure modes when fetching a will for cloning.
 *
 * - `not_found`  — The will no longer exists on chain (deleted / archived).
 * - `permission` — The caller is not authorised to read this will.
 * - `network`    — RPC / connectivity failure; the caller can retry.
 * - `unknown`    — Any other error.
 */
export type CloneErrorKind = 'not_found' | 'permission' | 'network' | 'unknown';

/**
 * Classifies a thrown value from `getWill()` into one of the four
 * `CloneErrorKind` buckets so the UI can show a targeted message.
 *
 * Resolution order (most-specific first):
 *   1. not_found  — contract reports the will does not exist
 *   2. permission — contract reports the caller is unauthorized
 *   3. network    — RPC or fetch-level connectivity error
 *   4. unknown    — everything else
 */
export function classifyCloneError(error: unknown): CloneErrorKind {
  const message = extractMessage(error).toLowerCase();

  if (
    message.includes('not found') ||
    message.includes('willnotfound') ||
    message.includes('no such will') ||
    message.includes('does not exist') ||
    message.includes('error(contract, #1)')
  ) {
    return 'not_found';
  }

  if (
    message.includes('unauthorized') ||
    message.includes('permission') ||
    message.includes('access denied') ||
    message.includes('forbidden') ||
    message.includes('not allowed')
  ) {
    return 'permission';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'network';
  }

  return 'unknown';
}

/**
 * Shared check for whether an error message indicates the will's on-chain
 * status is no longer `Active` (e.g. it was released, triggered, cancelled,
 * or otherwise transitioned between page load and the check-in attempt).
 *
 * The SDK surfaces these as contract-level rejections with a variety of
 * phrasings, so we match on the common status-related keywords as well as
 * the contract error codes the will contract uses for invalid state.
 */
export function isWillStatusChangedMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('status') ||
    msg.includes('released') ||
    msg.includes('triggered') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('not active') ||
    msg.includes('inactive') ||
    msg.includes('no longer active') ||
    msg.includes('invalid state') ||
    msg.includes('error(contract, #2)') ||
    msg.includes('error(contract, #3)') ||
    msg.includes('error(contract, #4)')
  );
}

export function isWillStatusChangedError(error: unknown): boolean {
  return isWillStatusChangedMessage(extractMessage(error));
}

/**
 * The distinct failure modes when submitting a check-in.
 *
 * - `network`        — RPC / connectivity failure; the caller can retry.
 * - `status-changed` — The will is no longer `Active` on chain (released,
 *                      triggered, cancelled, etc.); the caller should
 *                      refresh the will data.
 * - `contract`       — The contract rejected the call (will not found,
 *                      simulation failure, unauthorized, etc.); retrying
 *                      won't help.
 * - `unknown`        — Any other error.
 */
export type CheckInErrorKind = 'network' | 'status-changed' | 'contract' | 'unknown';

/**
 * Classifies a thrown value from a check-in call into one of the three
 * `CheckInErrorKind` buckets so the UI can show a targeted message.
 *
 * Resolution order (most-specific first):
 *   1. network        — RPC or fetch-level connectivity error
 *   2. status-changed — the will is no longer Active on chain
 *   3. contract       — contract-level rejection (not found, simulation,
 *                       unauthorized, insufficient funds, etc.)
 *   4. unknown        — everything else
 */
export function classifyCheckInError(error: unknown): CheckInErrorKind {
  const message = extractMessage(error).toLowerCase();

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('offline')
  ) {
    return 'network';
  }

  if (isWillStatusChangedMessage(message)) {
    return 'status-changed';
  }

  if (
    message.includes('contract') ||
    message.includes('simulation') ||
    message.includes('unauthorized') ||
    message.includes('permission') ||
    message.includes('insufficient') ||
    message.includes('balance') ||
    isWillNotFoundMessage(message)
  ) {
    return 'contract';
  }

  return 'unknown';
}

/**
 * Returns a category-specific, user-facing message for a failed check-in.
 * Network failures suggest retrying; contract failures explain that the
 * will rejected the action.
 */
export function formatCheckInError(error: unknown): string {
  if (typeof console !== 'undefined') {
    console.error('[SoroWill] Check-in error:', error);
  }

  switch (classifyCheckInError(error)) {
    case 'network':
      return 'Unable to reach the blockchain network. Please check your connection and try again.';
    case 'status-changed':
      return 'This will is no longer active — its status changed on-chain. Refreshing…';
    case 'contract':
      return 'Check-in was rejected by the contract. The will may no longer be in a state that allows this action.';
    default:
      return 'Check-in failed. Please try again later.';
  }
}

export function formatError(error: unknown): string {
  const message = extractMessage(error);

  // Log the full error for debugging — never expose raw objects to the UI.
  if (typeof console !== 'undefined') {
    console.error('[SoroWill] SDK/RPC error:', error);
  }

  for (const pattern of KNOWN_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return pattern.friendly;
    }
  }

  return 'Something went wrong. Please try again later.';
}

/** Safe copy for initial page data loads; never exposes SDK/RPC details. */
export function formatLoadError(error: unknown): string {
  if (error instanceof Error && /permission|unauthoriz|forbidden/i.test(error.message)) return 'You do not have permission to view this will.';
  return 'Could not load will — check your connection.';
}

/**
 * Standardized API error schema
 * -----------------------------
 * Every API route under `src/app/api/*` returns errors in the same JSON
 * shape so clients can handle them uniformly:
 *
 * ```json
 * {
 *   "error": {
 *     "code": "not_found",
 *     "message": "This will was not found on the blockchain."
 *   }
 * }
 * ```
 *
 * - `code`    — a stable, machine-readable category (see `ApiErrorCode`).
 * - `message` — a human-readable, user-safe description.
 *
 * The HTTP status code is derived from the category via
 * `API_ERROR_STATUS` so status codes stay consistent across endpoints.
 */
export type ApiErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'server_error';

/** Canonical HTTP status code for each API error category. */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  validation: 400,
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  server_error: 500,
};

/** The JSON body shape returned by every API error response. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/**
 * Builds a standardized API error response.
 *
 * @param code    Machine-readable error category.
 * @param message Human-readable, user-safe message.
 * @param status  Optional explicit HTTP status; defaults to the canonical
 *                status for `code` from `API_ERROR_STATUS`.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number = API_ERROR_STATUS[code],
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}
