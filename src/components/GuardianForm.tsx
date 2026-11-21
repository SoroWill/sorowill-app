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

/** Splits pasted bulk input on newlines and commas, trimming each entry. */
export function splitBulkAddresses(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/** Returns true when a single entry is a valid Stellar or federated address. */
export function isValidGuardianAddress(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return STELLAR_ADDRESS_RE.test(trimmed) || isFederatedAddress(trimmed);
}

export interface BulkImportSummary {
  /** Valid, unique, in-limit addresses ready to be added. */
  accepted: string[];
  /** Entries that failed address validation. */
  invalid: string[];
  /** Entries that duplicate an existing guardian or an earlier entry in the batch. */
  duplicates: string[];
  /** Entries that equal the connected owner address. */
  owner: string[];
  /** Valid, unique entries dropped because MAX_GUARDIANS would be exceeded. */
  overLimit: string[];
}

/**
 * Parses a bulk paste into accepted addresses plus a summary of rejected
 * entries. Deduplicates case-insensitively against existing guardians and
 * within the batch, rejects the owner address, and respects MAX_GUARDIANS.
 */
export function parseBulkAddresses(
  input: string,
  existingGuardians: string[],
  ownerAddress?: string | null
): BulkImportSummary {
  const normalizedOwner = ownerAddress?.trim().toLowerCase() ?? '';
  const seen = new Set(
    existingGuardians
      .map((g) => g.trim().toLowerCase())
      .filter((g) => g !== '')
  );
  const summary: BulkImportSummary = {
    accepted: [],
    invalid: [],
    duplicates: [],
    owner: [],
    overLimit: [],
  };

  const existingCount = existingGuardians.filter((g) => g.trim() !== '').length;
  let remaining = Math.max(0, MAX_GUARDIANS - existingCount);

  for (const entry of splitBulkAddresses(input)) {
    const normalized = entry.toLowerCase();
    if (!isValidGuardianAddress(entry)) {
      summary.invalid.push(entry);
      continue;
    }
    if (normalizedOwner && normalized === normalizedOwner) {
      summary.owner.push(entry);
      continue;
    }
    if (seen.has(normalized)) {
      summary.duplicates.push(entry);
      continue;
    }
    if (remaining <= 0) {
      summary.overLimit.push(entry);
      continue;
    }
    seen.add(normalized);
    remaining -= 1;
    summary.accepted.push(entry);
  }

  return summary;
}

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
  const [bulkInput, setBulkInput] = useState('');
  const [bulkSummary, setBulkSummary] = useState<BulkImportSummary | null>(null);

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

  const handleBulkImport = () => {
    const summary = parseBulkAddresses(bulkInput, guardians, ownerAddress);
    setBulkSummary(summary);
    if (summary.accepted.length === 0) return;

    // Reuse existing blank rows first, then append new rows via onAdd.
    const blankIndices: number[] = [];
    guardians.forEach((g, index) => {
      if (g.trim() === '') blankIndices.push(index);
    });

    const totalAfter = guardians.filter((g) => g.trim() !== '').length + summary.accepted.length;
    const neededNewRows = Math.max(0, totalAfter - guardians.length);
    for (let i = 0; i < neededNewRows; i += 1) onAdd();

    summary.accepted.forEach((address, i) => {
      const targetIndex = i < blankIndices.length ? blankIndices[i] : guardians.length + (i - blankIndices.length);
      onUpdate(targetIndex, address);
    });

    setBulkInput('');
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

      <div className="space-y-2">
        <label htmlFor="guardian-bulk-import" className="text-xs font-medium text-will-light/70">
          Paste multiple addresses
        </label>
        <textarea
          id="guardian-bulk-import"
          value={bulkInput}
          onChange={(e) => {
            setBulkInput(e.target.value);
            setBulkSummary(null);
          }}
          placeholder={'One address per line, or comma-separated (G... or name*domain.com)'}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
        />
        <button
          type="button"
          onClick={handleBulkImport}
          disabled={bulkInput.trim() === ''}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-will-light/70 transition hover:border-will-purple hover:text-will-light disabled:opacity-40"
        >
          Import addresses
        </button>

        {bulkSummary ? (
          <div
            className="space-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium text-will-light">Import summary</p>
            <p className="text-emerald-400">
              {bulkSummary.accepted.length} added
            </p>
            {bulkSummary.invalid.length > 0 ? (
              <p className="text-red-400">
                {bulkSummary.invalid.length} invalid: {bulkSummary.invalid.join(', ')}
              </p>
            ) : null}
            {bulkSummary.duplicates.length > 0 ? (
              <p className="text-amber-400">
                {bulkSummary.duplicates.length} duplicate
                {bulkSummary.duplicates.length === 1 ? '' : 's'} skipped:{' '}
                {bulkSummary.duplicates.join(', ')}
              </p>
            ) : null}
            {bulkSummary.owner.length > 0 ? (
              <p className="text-red-400">
                {bulkSummary.owner.length} owner address
                {bulkSummary.owner.length === 1 ? '' : 'es'} rejected: {OWNER_AS_GUARDIAN_ERROR}
              </p>
            ) : null}
            {bulkSummary.overLimit.length > 0 ? (
              <p className="text-amber-400">
                {bulkSummary.overLimit.length} over the {MAX_GUARDIANS}-guardian limit:{' '}
                {bulkSummary.overLimit.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

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
