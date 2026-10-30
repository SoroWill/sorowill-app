'use client';

import { memo, useState } from 'react';

import { MAX_GUARDIANS, GUARDIAN_THRESHOLD } from '@/lib/constants';
import { isFederatedAddress } from '@/lib/federated';
import { OWNER_AS_GUARDIAN_ERROR } from '@/lib/guardianValidation';

export interface GuardianFormProps {
  /** Current list of guardian address strings (may contain empty strings for blank rows). */
  guardians: string[];
  /** Stable per-index IDs used as React keys and for resolution tracking. */
  guardianIds: Map<number, string>;
  /** Map from guardianId → resolved Stellar address for federated entries. */
  resolvedGuardians: Map<string, string>;
  /** Map from guardianId → resolution error message. */
  guardianResolutionError: Map<string, string>;
  /** ID of the guardian currently being resolved (null if none). */
  resolvingGuardianId: string | null;
  /** Per-row validation error messages (indexed by guardian position). */
  rowErrors: string[];
  /** Top-level validation error to show at the bottom of the list, or null. */
  topError: string | null;
  /** Indices of blank guardian rows (shown as warning). */
  blankGuardianIndices: number[];
  /** Connected will owner's address; rows matching it are flagged as invalid (#386). */
  ownerAddress?: string | null;

  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, value: string) => void;
  onResolve: (index: number, address: string) => void;
}

interface GuardianRowProps {
  index: number;
  guardian: string;
  rowError: string;
  resolvedAddress?: string;
  resolutionError?: string;
  isResolving: boolean;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onResolve: (index: number, address: string) => void;
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Returns validation feedback for a guardian input value.
 * Empty strings are not flagged here (blank rows are handled separately).
 */
export function getAddressFeedback(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || isFederatedAddress(trimmed)) return '';
  if (STELLAR_ADDRESS_RE.test(trimmed)) return '';
  if (trimmed.startsWith('G')) {
    return 'Stellar addresses must be 56 characters starting with G (A–Z, 2–7).';
  }
  return 'Enter a Stellar address (G…) or a federated address (name*domain.com).';
}

/**
 * A single guardian row. Memoized so editing one guardian only re-renders that
 * row — all props are primitives or stable callbacks, so shallow equality suffices.
 */
export const GuardianRow = memo(function GuardianRow({
  index,
  guardian,
  rowError,
  resolvedAddress,
  resolutionError,
  isResolving,
  onUpdate,
  onRemove,
  onResolve,
}: GuardianRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor={`guardian-${index}`} className="sr-only">
          Guardian {index + 1} address
        </label>
        <input
          id={`guardian-${index}`}
          type="text"
          value={guardian}
          onChange={(e) => onUpdate(index, e.target.value)}
          placeholder="Guardian address (G...) or federated address (name*domain.com)"
          aria-describedby={rowError ? `guardian-error-${index}` : undefined}
          aria-invalid={rowError ? 'true' : undefined}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:outline-none ${
            rowError
              ? 'border-red-400/60 bg-red-500/5 focus:border-red-400'
              : guardian.trim() === ''
              ? 'border-amber-400/40 bg-white/5 focus:border-will-purple'
              : 'border-white/10 bg-white/5 focus:border-will-purple'
          }`}
        />
        {isFederatedAddress(guardian) && (
          <button
            type="button"
            onClick={() => onResolve(index, guardian)}
            disabled={isResolving}
            className="whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-will-light/70 transition hover:border-will-purple hover:text-will-light disabled:opacity-40"
          >
            {isResolving ? 'Resolving…' : 'Resolve'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`Remove guardian ${index + 1}`}
          className="rounded-lg border border-white/10 px-2 py-2 text-will-light/60 transition hover:border-red-400/40 hover:text-red-400"
        >
          ✕
        </button>
      </div>

      {resolvedAddress && (
        <div
          className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2"
          role="status"
        >
          <p className="text-xs text-emerald-400">
            <span aria-hidden="true">✓</span> Resolved
          </p>
          <p className="break-all font-mono text-xs text-emerald-300/80">
            Original: {guardian}
          </p>
          <p className="break-all font-mono text-xs text-emerald-300">
            Resolved address: {resolvedAddress}
          </p>
        </div>
      )}

      {resolutionError && (
        <div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2">
          <p className="text-xs text-red-400">{resolutionError}</p>
        </div>
      )}

      {rowError ? (
        <p
          id={`guardian-error-${index}`}
          className="text-xs text-red-400"
          role="alert"
        >
          {rowError}
        </p>
      ) : null}

      {!rowError && guardian.trim() === '' ? (
        <p className="text-xs text-amber-400/80">
          This empty row will be excluded when the will is submitted.
        </p>
      ) : null}
    </div>
  );
});

/**
 * Controlled form section for adding/removing/editing guardian addresses.
 *
 * The "Add guardian" button is disabled once the list reaches MAX_GUARDIANS,
 * which is always imported from @/lib/constants — never hardcoded — so this
 * component and the rest of the app share a single source of truth for the
 * contract-enforced limit.
 */
export function GuardianForm({
  guardians,
  guardianIds,
  resolvedGuardians,
  guardianResolutionError,
  resolvingGuardianId,
  rowErrors,
  topError,
  blankGuardianIndices,
  ownerAddress = null,
  onAdd,
  onRemove,
  onUpdate,
  onResolve,
}: GuardianFormProps) {
  const [addError, setAddError] = useState<string | null>(null);

  const normalizedOwner = ownerAddress?.trim().toLowerCase() ?? '';

  const handleAdd = () => {
    if (normalizedOwner) {
      const ownerAlreadyPresent = guardians.some(
        (g) => g.trim().toLowerCase() === normalizedOwner
      );
      if (ownerAlreadyPresent) {
        setAddError(OWNER_AS_GUARDIAN_ERROR);
        return;
      }
    }
    setAddError(null);
    onAdd();
  };

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium text-will-light">
          Guardians (optional, up to {MAX_GUARDIANS})
        </legend>
        <button
          type="button"
          onClick={handleAdd}
          disabled={guardians.length >= MAX_GUARDIANS}
          aria-label={`Add guardian (${guardians.length} of ${MAX_GUARDIANS})`}
          title={
            guardians.length >= MAX_GUARDIANS
              ? `Maximum of ${MAX_GUARDIANS} guardians reached`
              : undefined
          }
          className="text-xs font-medium text-will-purple hover:underline disabled:opacity-40"
        >
          + Add guardian
        </button>
      </div>

      <p className="text-xs text-will-light/50">
        Any {GUARDIAN_THRESHOLD} of your guardians can force an early release if you&apos;re
        incapacitated.
      </p>

      {addError ? (
        <p
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-400"
          role="alert"
        >
          {addError}
        </p>
      ) : null}

      {guardians.map((guardian, index) => {
        const guardianId = guardianIds.get(index) || '';
        const isOwner =
          !!normalizedOwner && guardian.trim().toLowerCase() === normalizedOwner;
        const rowError = rowErrors[index] || (isOwner ? OWNER_AS_GUARDIAN_ERROR : '');
        return (
          <div key={guardianId} className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor={`guardian-${index}`} className="sr-only">
                Guardian {index + 1} address
              </label>
              <input
                id={`guardian-${index}`}
                type="text"
                value={guardian}
                onChange={(e) => onUpdate(index, e.target.value)}
                placeholder="Guardian address (G...) or federated address (name*domain.com)"
                spellCheck={false}
                autoComplete="off"
                aria-label={`Guardian ${index + 1} address`}
                aria-describedby={rowError ? `guardian-error-${index}` : undefined}
                aria-invalid={rowError ? 'true' : undefined}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:outline-none ${
                  rowError
                    ? 'border-red-400/60 bg-red-500/5 focus:border-red-400'
                    : guardian.trim() === '' && guardians.length > 0
                    ? 'border-amber-400/40 bg-white/5 focus:border-will-purple'
                    : 'border-white/10 bg-white/5 focus:border-will-purple'
                }`}
              />
              {isFederatedAddress(guardian) && (
                <button
                  type="button"
                  onClick={() => onResolve(index, guardian)}
                  disabled={resolvingGuardianId === guardianId}
                  className="whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-will-light/70 transition hover:border-will-purple hover:text-will-light disabled:opacity-40"
                >
                  {resolvingGuardianId === guardianId ? 'Resolving…' : 'Resolve'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove guardian ${index + 1}`}
                className="rounded-lg border border-white/10 px-2 py-2 text-will-light/60 transition hover:border-red-400/40 hover:text-red-400"
              >
                ✕
              </button>
            </div>

            {resolvedGuardians.has(guardianId) && (
              <div
                className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2"
                role="status"
              >
                <p className="text-xs text-emerald-400">
                  <span aria-hidden="true">✓</span> Resolved
                </p>
                <p className="break-all font-mono text-xs text-emerald-300/80">
                  Original: {guardian}
                </p>
                <p className="break-all font-mono text-xs text-emerald-300">
                  Resolved address: {resolvedGuardians.get(guardianId)}
                </p>
              </div>
            )}

            {guardianResolutionError.has(guardianId) && (
              <div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2">
                <p className="text-xs text-red-400">{guardianResolutionError.get(guardianId)}</p>
              </div>
            )}

            {rowError ? (
              <p
                id={`guardian-error-${index}`}
                className="text-xs text-red-400"
                role="alert"
              >
                {rowError}
              </p>
            ) : null}

            {!rowError && getAddressFeedback(guardian) ? (
              <p className="text-xs text-amber-400/80" role="status">
                {getAddressFeedback(guardian)}
              </p>
            ) : null}

            {!rowError && guardian.trim() === '' ? (
              <p className="text-xs text-amber-400/80">
                This empty row will be excluded when the will is submitted.
              </p>
            ) : null}
          </div>
        );
      })}

      {topError && (
        <p
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-400"
          role="alert"
        >
          {topError}
        </p>
      )}

      {blankGuardianIndices.length > 0 && guardians.some((g) => g.trim() !== '') ? (
        <p
          className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400"
          role="status"
        >
          {blankGuardianIndices.length === 1
            ? '1 empty guardian row will not be included in the will.'
            : `${blankGuardianIndices.length} empty guardian rows will not be included in the will.`}
        </p>
      ) : null}
    </fieldset>
  );
}
