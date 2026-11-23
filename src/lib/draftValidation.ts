/**
 * Runtime validation for the NewWill localStorage draft.
 *
 * We intentionally avoid a third-party schema library so as not to add a new
 * dependency.  The schema mirrors the `FormState` interface in
 * `src/app/will/new/page.tsx` exactly.
 */

import type { Beneficiary } from '@sorowill/sdk';

/** localStorage key the NewWill form autosaves its draft under. */
export const DRAFT_STORAGE_KEY = 'sorowill-form-draft';

/** Highest wizard step index (Amount, Beneficiaries, Timing, Guardians, Review). */
export const DRAFT_MAX_STEP = 4;

export interface FormStateDraft {
  step: number;
  token: string;
  amount: string;
  beneficiaries: Beneficiary[];
  checkinPeriodDays: number;
  gracePeriodDays: number;
  guardians: string[];
}

function isBeneficiary(value: unknown): value is Beneficiary {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.address === 'string' && Number.isFinite(obj.percentage);
}

/**
 * Returns true when `value` is a fully-formed, structurally valid FormStateDraft.
 * Individual field semantics (e.g. address format, period range) are validated
 * by the form itself; this check only guards against corrupted / stale shapes.
 */
export function isValidDraft(value: unknown): value is FormStateDraft {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;

  // An out-of-range step would render an empty wizard with no way forward.
  if (typeof obj.step !== 'number' || !Number.isInteger(obj.step)) return false;
  if (obj.step < 0 || obj.step > DRAFT_MAX_STEP) return false;
  if (typeof obj.token !== 'string') return false;
  if (typeof obj.amount !== 'string') return false;
  if (!Array.isArray(obj.beneficiaries)) return false;
  if (!obj.beneficiaries.every(isBeneficiary)) return false;
  if (typeof obj.checkinPeriodDays !== 'number') return false;
  if (typeof obj.gracePeriodDays !== 'number') return false;
  if (!Array.isArray(obj.guardians)) return false;
  if (!obj.guardians.every((g: unknown) => typeof g === 'string')) return false;

  return true;
}

/**
 * Parses a raw JSON string from localStorage and validates it.
 *
 * Returns the parsed draft on success, or `null` if the string is absent,
 * malformed JSON, or fails the structural check.
 */
export function parseDraft(raw: string | null): FormStateDraft | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidDraft(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type DraftLoadResult =
  | { status: 'missing'; draft: null }
  | { status: 'invalid'; draft: null }
  | { status: 'valid'; draft: FormStateDraft };

/**
 * Reads the draft from `storage` and validates it before anything uses it.
 * An invalid draft (corrupted JSON or a stale shape) is removed from storage
 * so it is never offered again; the caller decides how to tell the user.
 */
export function loadDraft(storage: Pick<Storage, 'getItem' | 'removeItem'>): DraftLoadResult {
  const raw = storage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return { status: 'missing', draft: null };
  const draft = parseDraft(raw);
  if (!draft) {
    storage.removeItem(DRAFT_STORAGE_KEY);
    return { status: 'invalid', draft: null };
  }
  return { status: 'valid', draft };
}

/**
 * Validates `state` and persists it only when it is a well-formed draft.
 *
 * The form autosaves on every change, so mid-edit states (e.g. a period field
 * cleared to NaN while the user retypes it) would otherwise overwrite the
 * last good draft. When `state` is invalid the previously saved draft is left
 * untouched, so a refresh restores the last valid state rather than a broken
 * one. Returns true when the draft was written.
 */
export function saveDraft(storage: Pick<Storage, 'setItem'>, state: unknown): boolean {
  if (!isValidDraft(state)) return false;
  if (!isValidPeriodDays(state.checkinPeriodDays)) return false;
  if (!isValidPeriodDays(state.gracePeriodDays)) return false;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Quota exceeded or storage disabled: autosave is best-effort.
    return false;
  }
}

/**
 * Removes the saved draft. Called after a will is created and when the wallet
 * disconnects, so a finished or another account's draft is never offered.
 */
export function clearDraft(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(DRAFT_STORAGE_KEY);
}

/** Default autosave cadence for the NewWill draft, in milliseconds. */
export const DRAFT_AUTOSAVE_INTERVAL_MS = 30_000;

export interface DraftAutosaver {
  /** Begins periodic saving. Calling start twice is a no-op. */
  start: () => void;
  /** Stops periodic saving. Safe to call when not started. */
  stop: () => void;
  /** Saves immediately (subject to validation) and returns whether it wrote. */
  saveNow: () => boolean;
}

/**
 * Creates a periodic autosaver for the NewWill draft.
 *
 * `getState` is called on each tick so the latest form state is captured
 * without the caller having to re-create the autosaver. Each tick goes through
 * `saveDraft`, so invalid mid-edit states never overwrite the last good draft.
 * The interval is unref'd when the runtime supports it so a pending timer can
 * never keep a Node process (e.g. in tests) alive.
 */
export function createDraftAutosaver(
  storage: Pick<Storage, 'setItem'>,
  getState: () => unknown,
  intervalMs: number = DRAFT_AUTOSAVE_INTERVAL_MS,
): DraftAutosaver {
  let timer: ReturnType<typeof setInterval> | null = null;

  const saveNow = (): boolean => saveDraft(storage, getState());

  const start = (): void => {
    if (timer !== null) return;
    timer = setInterval(saveNow, intervalMs);
    // Node's Timeout exposes unref; browsers return a number without it.
    const maybeUnref = timer as unknown as { unref?: () => void };
    if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
  };

  const stop = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  return { start, stop, saveNow };
}

// ---------------------------------------------------------------------------
// Period-value helpers (shared between the form and unit tests)
// ---------------------------------------------------------------------------

/** True when `days` is a safe positive integer within the allowed range. */
export function isValidPeriodDays(days: unknown): days is number {
  if (typeof days !== 'number') return false;
  if (!Number.isInteger(days)) return false;
  if (days < 1) return false;
  if (days > 3650) return false;
  return true;
}

/**
 * Coerces a raw input string to a positive integer period value.
 *
 * Returns the integer on success or `null` if the value is blank, non-numeric,
 * decimal, zero, negative, or out of range.
 */
export function parsePeriodInput(raw: string): number | null {
  if (raw.trim() === '') return null;
  // Reject anything with a decimal point — parseInt('1.5') would silently
  // truncate to 1, which is exactly the silent-truncation bug we are fixing.
  if (raw.includes('.')) return null;
  const value = parseInt(raw, 10);
  if (!isValidPeriodDays(value)) return null;
  return value;
}
