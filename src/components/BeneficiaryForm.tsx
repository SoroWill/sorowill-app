'use client';

import { HelpTooltip } from '@/components/HelpTooltip';
import { FIELD_HELP, FIELD_HELP_DOCS } from '@/lib/fieldHelp';
import { useAddressHistory } from './AddressHistory';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Beneficiary } from '@sorowill/sdk';

import { isFederatedAddress, resolveFederatedAddress } from '@/lib/federated';
import { formatError } from '@/lib/errors';
import { getWhitelistError, useBeneficiaryWhitelist } from '@/lib/beneficiaryWhitelist';

export interface BeneficiaryFormProps {
  value: Beneficiary[];
  onChange: (beneficiaries: Beneficiary[]) => void;
  /**
   * Kind of address the selected token accepts for beneficiaries: `account`
   * (classic `G...`, the default) or `contract` (`C...`). Addresses of the
   * other kind are flagged because the contract would reject them.
   */
  addressType?: BeneficiaryAddressType;
}

export type BeneficiaryAddressType = 'account' | 'contract';

/** Wait for a pause in typing before a federation lookup leaves the browser. */
const FEDERATION_RESOLUTION_DEBOUNCE_MS = 300;

const ADDRESS_PATTERNS: Record<BeneficiaryAddressType, RegExp> = {
  account: /^G[0-9A-Z]{55}$/,
  contract: /^C[0-9A-Z]{55}$/,
};

const ADDRESS_TYPE_LABELS: Record<BeneficiaryAddressType, string> = {
  account: 'a Stellar account address starting with G',
  contract: 'a contract address starting with C',
};

function isValidStellarAddress(address: string, addressType: BeneficiaryAddressType = 'account'): boolean {
  if (!address) return false;
  return ADDRESS_PATTERNS[addressType].test(address);
}

/**
 * Returns an error when `address` is well-formed but of the wrong kind for the
 * selected token (e.g. a `G...` account where a `C...` contract is required).
 */
export function getAddressTypeMismatchError(
  address: string,
  addressType: BeneficiaryAddressType,
): string | null {
  const other: BeneficiaryAddressType = addressType === 'account' ? 'contract' : 'account';
  if (!isValidStellarAddress(address, addressType) && isValidStellarAddress(address, other)) {
    return `The selected token requires ${ADDRESS_TYPE_LABELS[addressType]}; the contract will reject this ${
      other === 'account' ? 'account (G...)' : 'contract (C...)'
    } address`;
  }
  return null;
}

/**
 * Suggests a corrected address for a near-miss (stray quotes/whitespace or
 * lowercase letters), or `null` when no simple fix produces a valid address.
 */
export function suggestAddressFix(address: string): string | null {
  const cleaned = address.replace(/[\s"'`]/g, '').toUpperCase();
  return cleaned !== address && isValidStellarAddress(cleaned) ? cleaned : null;
}

/** Splits pasted text into candidate addresses (newline, comma, semicolon or space separated). */
export function parsePastedAddresses(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^["'`]+|["'`]+$/g, ''))
    .filter(Boolean);
}

/**
 * The SDK's `Beneficiary.percentage` field is typed as `number`, but some
 * SDK versions/boundaries (e.g. values round-tripped through Soroban
 * contract calls) may hand back a `bigint` instead. Converting at this
 * single boundary keeps the rest of the component's arithmetic (which
 * relies on fractional `number` math) safe regardless of which type the
 * SDK actually sends.
 */
export function toPercentageNumber(percentage: Beneficiary['percentage'] | bigint): number {
  return typeof percentage === 'bigint' ? Number(percentage) : percentage;
}

function addressKey(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Rows whose address already appears in an earlier row, as `index -> index of the first row with
 * that address`. Blank rows are ignored. Addresses are compared without case or surrounding
 * spaces, so a pasted lowercase copy is still caught (#825).
 */
export function findDuplicateBeneficiaries(beneficiaries: Beneficiary[]): Map<number, number> {
  const firstSeen = new Map<string, number>();
  const duplicates = new Map<number, number>();
  beneficiaries.forEach((b, index) => {
    const key = addressKey(b.address);
    if (!key) return;
    const first = firstSeen.get(key);
    if (first === undefined) firstSeen.set(key, index);
    else duplicates.set(index, first);
  });
  return duplicates;
}

export function hasDuplicateBeneficiaryAddresses(beneficiaries: Beneficiary[]): boolean {
  return findDuplicateBeneficiaries(beneficiaries).size > 0;
}

function getAddressErrors(
  beneficiaries: Beneficiary[],
  addressType: BeneficiaryAddressType = 'account',
  whitelist: readonly string[] = [],
): Record<number, string> {
  const errors: Record<number, string> = {};
  beneficiaries.forEach((b, i) => {
    if (b.percentage > 0 && !b.address.trim()) {
      errors[i] = 'Address is required';
    } else if (b.address && isFederatedAddress(b.address)) {
      // A federated address (name*domain) is only valid once resolved to a G...
      // address; the contract rejects the raw form, so block submission.
      errors[i] = 'Federated address must be resolved before submitting — click Resolve';
    } else if (b.address && !isFederatedAddress(b.address) && !isValidStellarAddress(b.address, addressType)) {
      const suggestion = suggestAddressFix(b.address);
      errors[i] =
        getAddressTypeMismatchError(b.address, addressType) ??
        (suggestion ? `Invalid Stellar address — did you mean ${suggestion}?` : 'Invalid Stellar address');
    } else if (b.address) {
      // Only whitelisted addresses may be added as beneficiaries (#892).
      const whitelistError = getWhitelistError(b.address, whitelist);
      if (whitelistError) errors[i] = whitelistError;
    }
  });
  return errors;
}

/** Returns true when a raw numeric string has more than two decimal places. */
export function hasExcessPrecision(raw: string): boolean {
  const match = /^\s*[+-]?\d*\.(\d+)\s*$/.exec(raw);
  if (!match) return false;
  return match[1].replace(/0+$/, '').length > 2;
}

function equalSplit(count: number): number[] {
  if (count === 0) {
    return [];
  }
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, index) => base + (index >= count - remainder ? 1 : 0));
}

/**
 * The SDK encodes each percentage as `percentage * 100` basis points and the
 * contract requires those to sum to exactly 10,000. Working in integer
 * hundredths here keeps the form's arithmetic identical to that encoding and
 * free of floating-point drift (e.g. 33.33 + 33.33 + 33.34).
 */
function toHundredths(percentage: Beneficiary['percentage'] | bigint): number {
  return Math.round(toPercentageNumber(percentage) * 100);
}

function hasAtMostTwoDecimals(percentage: Beneficiary['percentage'] | bigint): boolean {
  return Math.abs(toPercentageNumber(percentage) * 100 - toHundredths(percentage)) < 1e-6;
}

function sumPercentages(beneficiaries: Beneficiary[]): number {
  return beneficiaries.reduce((sum, b) => sum + toHundredths(b.percentage), 0) / 100;
}

/**
 * Returns a per-row validation message for a single beneficiary's percentage,
 * or `null` when the entry is valid. Mirrors the aggregate checks in
 * `getBeneficiaryValidationMessage` so a row is highlighted for exactly the
 * reasons that would block submission.
 */
export function getPercentageRowError(percentage: Beneficiary['percentage'] | bigint): string | null {
  const value = toPercentageNumber(percentage);
  if (value < 0 || value > 100) {
    return 'Percentage must be between 0% and 100%';
  }
  if (!hasAtMostTwoDecimals(percentage)) {
    return 'Percentage can have at most 2 decimal places';
  }
  if (toHundredths(percentage) % 100 !== 0) {
    return 'Percentage must be a whole number (e.g. 33, not 33.5)';
  }
  return null;
}

/**
 * Tolerance for comparing the percentage total against 100. Percentages are
 * stored with at most two decimal places, so any drift is far below this
 * threshold; it only guards against floating-point noise (e.g. 99.99999).
 */
const PERCENTAGE_SUM_EPSILON = 1e-9;

/**
 * Returns a human-readable validation message for the current beneficiary
 * list, or `null` when the list is valid.
 *
 * Failure modes are distinguished:
 *  1. More than two decimal places     → "at most 2 decimal places"
 *  2. Any percentage is non-integer   → "Percentages must be whole numbers",
 *     plus a warning showing how rounding would change the distribution
 *  3. Sum is not 100 (but all integers) → "Total must equal 100%"
 */
function getBeneficiaryValidationMessage(beneficiaries: Beneficiary[]): string | null {
  if (beneficiaries.length === 0) {
    return 'Add at least one beneficiary';
  }

  const duplicates = findDuplicateBeneficiaries(beneficiaries);
  if (duplicates.size > 0) {
    const rows = [...duplicates].map(([index, first]) => `${first + 1} and ${index + 1}`).join(', ');
    return `The same address is used more than once (beneficiary ${rows}). Remove the duplicate or use a different address`;
  }

  const hasInvalidRange = beneficiaries.some((b) => b.percentage < 0 || b.percentage > 100);
  if (hasInvalidRange) {
    return 'Percentages must be between 0% and 100%';
  }

  if (!beneficiaries.every((b) => hasAtMostTwoDecimals(b.percentage))) {
    return 'Percentages can have at most 2 decimal places';
  }

  const hasNonInteger = beneficiaries.some((b) => toHundredths(b.percentage) % 100 !== 0);
  if (hasNonInteger) {
    // The SDK only encodes whole percentages; show what rounding each share
    // would produce so the user sees the distribution actually changes.
    const rounded = beneficiaries.map((b) => Math.round(toPercentageNumber(b.percentage)));
    const roundedTotal = rounded.reduce((sum, p) => sum + p, 0);
    return `Percentages must be whole numbers (e.g. 33, not 33.5) — rounding would give ${rounded
      .map((p) => `${p}%`)
      .join(' + ')} = ${roundedTotal}%`;
  }

  const total = sumPercentages(beneficiaries);
  if (Math.abs(total - 100) > PERCENTAGE_SUM_EPSILON) {
    const unallocated = Math.round((100 - total) * 100) / 100;
    const leftover =
      unallocated > 0
        ? `${unallocated}% would be left undistributed (dust)`
        : `${-unallocated}% is over-allocated`;
    return `Total must equal 100% (currently ${total}%) — shares are exact to 2 decimals, not rounded, so ${leftover}. Example of a valid split: 33.33 + 33.33 + 33.34 = 100`;
  }

  return null;
}

export function BeneficiaryForm({ value, onChange, addressType = 'account' }: BeneficiaryFormProps) {
  // Derived validation only depends on `value`; memoize so unrelated re-renders
  // (e.g. resolution state changes) don't re-validate large beneficiary lists.
  const total = useMemo(() => sumPercentages(value), [value]);
  const validationMessage = useMemo(() => getBeneficiaryValidationMessage(value), [value]);
  const addressErrors = useMemo(() => getAddressErrors(value, addressType), [value, addressType]);
  const duplicateRows = useMemo(() => findDuplicateBeneficiaries(value), [value]);
  const history = useAddressHistory('beneficiaries', (address) =>
    isValidStellarAddress(address, addressType) || (addressType === 'account' && isFederatedAddress(address)),
  );
  const roundedTotal = Math.round(total * 100) / 100;
  const remaining = Math.round((100 - roundedTotal) * 100) / 100;
  const isOverAllocated = roundedTotal > 100;
  // Save is only allowed when both the percentage split and every address are
  // valid; address errors are computed live so the button reflects typing (#786).
  const hasAddressErrors = Object.keys(addressErrors).length > 0;
  const isValid = validationMessage === null && !hasAddressErrors;

  const [beneficiaryIds, setBeneficiaryIds] = useState<Map<number, string>>(new Map());

  const stableBeneficiaryIds = useMemo(() => {
    const newIds = new Map(beneficiaryIds);
    value.forEach((_, index) => {
      if (!newIds.has(index)) {
        newIds.set(index, crypto.randomUUID());
      }
    });
    setBeneficiaryIds(newIds);
    return newIds;
  }, [value.length]);

  // Latest `value`, so an async resolution applies to the rows as they are
  // when it completes rather than to the snapshot taken when it started.
  const latestValue = useRef(value);
  const resolutionRequest = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  const [resolvedAddresses, setResolvedAddresses] = useState<Map<string, string>>(new Map());
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // Rows waiting out the federation debounce. Kept separate from
  // `resolvingId` so the Resolve button stays clickable while typing settles.
  const [debouncingIds, setDebouncingIds] = useState<Set<string>>(new Set());
  // Raw text entered per row (keyed by row id) so a >2 decimal entry can be
  // flagged even though the stored value is rounded to 2 decimals (#753).
  const [precisionWarnings, setPrecisionWarnings] = useState<Map<string, string>>(new Map());
  const [resolutionError, setResolutionError] = useState<Map<string, string>>(new Map());
  // Rows whose address has been edited or pasted into. Errors for untouched
  // rows stay hidden so a freshly added row isn't flagged before the user
  // has had a chance to type (#786).
  const [touchedRows, setTouchedRows] = useState<Set<string>>(new Set());

  function markTouched(index: number) {
    const id = stableBeneficiaryIds.get(index);
    if (!id) return;
    setTouchedRows((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function updateRow(index: number, patch: Partial<Beneficiary>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    if (patch.address !== undefined) {
      markTouched(index);
      const id = stableBeneficiaryIds.get(index);
      if (id) {
        resolutionRequest.current.delete(id);
        setResolvingId((current) => (current === id ? null : current));
        setResolvedAddresses((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setResolutionError((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }

  async function resolveBeneficiaryAddress(index: number, address: string) {
    const id = stableBeneficiaryIds.get(index);
    if (!id) return;

    if (!isFederatedAddress(address)) {
      setResolvedAddresses((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setResolutionError((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    resolutionRequest.current.set(id, address);
    setResolvingId(id);
    try {
      const resolved = await resolveFederatedAddress(address);
      // A response for text the user has since replaced must never overwrite
      // the newer row. This also makes debounced requests safe when a network
      // response arrives after a later keystroke.
      if (resolutionRequest.current.get(id) !== address) return;
      onChange(
        latestValue.current.map((row, rowIndex) => (rowIndex === index ? { ...row, address: resolved } : row)),
      );
      setResolvedAddresses((prev) => new Map(prev).set(id, resolved));
      setResolutionError((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      if (resolutionRequest.current.get(id) !== address) return;
      setResolutionError(
        (prev) =>
          new Map(prev).set(
            id,
            error instanceof Error ? formatError(error) : 'Failed to resolve address',
          ),
      );
      setResolvedAddresses((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } finally {
      if (resolutionRequest.current.get(id) === address) {
        setResolvingId((current) => (current === id ? null : current));
      }
    }
  }

  // Federation resolution is network I/O. Schedule it after typing settles so
  // a full `name*domain` entry yields one request rather than one per keypress.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    value.forEach((beneficiary, index) => {
      const id = stableBeneficiaryIds.get(index);
      const address = beneficiary.address.trim();
      if (!id || !isFederatedAddress(address)) return;

      // Mark the row busy during the debounce as well, so screen readers hear
      // that a lookup is pending.
      setDebouncingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      timers.push(setTimeout(() => {
        setDebouncingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (resolutionRequest.current.get(id) !== address) {
          void resolveBeneficiaryAddress(index, address);
        }
      }, FEDERATION_RESOLUTION_DEBOUNCE_MS));
    });
    return () => timers.forEach(clearTimeout);
  }, [stableBeneficiaryIds, value]);

  // Pasting several addresses at once fills one row per address; each is then
  // validated like a typed address, so invalid ones surface an error immediately.
  // A single pasted address falls through to the normal onChange path, which
  // also marks the row touched so its error shows right away (#786).
  function handleAddressPaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const tokens = parsePastedAddresses(event.clipboardData.getData('text'));
    if (tokens.length < 2) {
      markTouched(index);
      return;
    }
    event.preventDefault();
    const [first, ...rest] = tokens;
    const updated = value.map((row, i) => (i === index ? { ...row, address: first } : row));
    onChange([...updated, ...rest.map((address) => ({ address, percentage: 0 }))]);
    // Mark the pasted row and every newly appended row as touched so any
    // invalid pasted address is flagged without further interaction.
    setTouchedRows((prev) => {
      const next = new Set(prev);
      const firstId = stableBeneficiaryIds.get(index);
      if (firstId) next.add(firstId);
      rest.forEach((_, offset) => {
        const id = stableBeneficiaryIds.get(index + 1 + offset);
        if (id) next.add(id);
      });
      return next;
    });
  }

  function addRow() {
    onChange([...value, { address: '', percentage: 0 }]);
  }

  function removeRow(index: number) {
    const removedId = stableBeneficiaryIds.get(index);
    // Shift ids down past the removed row so every remaining row keeps its own
    // id, and its resolution state, instead of inheriting the deleted row's.
    setBeneficiaryIds((prev) => {
      const next = new Map<number, string>();
      prev.forEach((id, i) => {
        if (i < index) next.set(i, id);
        else if (i > index) next.set(i - 1, id);
      });
      return next;
    });
    if (removedId) {
      setResolvedAddresses((prev) => {
        const next = new Map(prev);
        next.delete(removedId);
        return next;
      });
      setResolutionError((prev) => {
        const next = new Map(prev);
        next.delete(removedId);
        return next;
      });
      setTouchedRows((prev) => {
        if (!prev.has(removedId)) return prev;
        const next = new Set(prev);
        next.delete(removedId);
        return next;
      });
    }
    onChange(value.filter((_, i) => i !== index));
  }

  function applyEqualSplit() {
    const shares = equalSplit(value.length);
    onChange(value.map((row, i) => ({ ...row, percentage: shares[i] ?? 0 })));
  }

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center">
          <legend className="text-sm font-semibold text-will-light">Beneficiaries</legend>
          <HelpTooltip label={FIELD_HELP.beneficiaries.label} text={FIELD_HELP.beneficiaries.text} docsHref={FIELD_HELP_DOCS} />
        </span>
        <button
          type="button"
          onClick={applyEqualSplit}
          disabled={value.length === 0}
          aria-label="Distribute Percentages Equally Among All Beneficiaries"
          className="min-h-[48px] px-2 text-xs font-medium text-will-purple hover:underline disabled:opacity-40"
        >
          Split Equally
        </button>
      </div>

      {history.controls}
      <div className="space-y-2" role="group" aria-label="Beneficiary List">
        {value.map((beneficiary, index) => {
          const beneficiaryId = stableBeneficiaryIds.get(index) || '';
          // Errors show once the row has been touched, or immediately when it
          // already holds text (a pre-filled/duplicated/pasted invalid value), so
          // typed and imported mistakes are visible without extra interaction.
          const addressError =
            (touchedRows.has(beneficiaryId) ||
              beneficiary.address.trim() !== '' ||
              beneficiary.percentage > 0)
              ? addressErrors[index]
              : undefined;
          const percentageError = getPercentageRowError(beneficiary.percentage);
          const hasPrecisionWarning = precisionWarnings.has(beneficiaryId);
          const percentageDescribedBy = hasPrecisionWarning
            ? `beneficiary-percentage-warning-${index}`
            : percentageError
              ? `beneficiary-percentage-error-${index}`
              : undefined;
          return (
          <div key={beneficiaryId} className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor={`beneficiary-address-${index}`} className="sr-only">
                  Beneficiary {index + 1} Address
                </label>
                <input
                  id={`beneficiary-address-${index}`}
                  type="text"
                  aria-label={`Beneficiary ${index + 1} Address`}
                  placeholder="Stellar address (G...) or federated address (name*domain.com)"
                  value={beneficiary.address}
                  onChange={(event) => updateRow(index, { address: event.target.value })}
                  onBlur={() => markTouched(index)}
                  onPaste={(event) => handleAddressPaste(index, event)}
                  aria-invalid={addressError || duplicateRows.has(index) ? 'true' : undefined}
                  aria-describedby={
                    addressError
                      ? `beneficiary-address-error-${index}`
                      : duplicateRows.has(index)
                        ? `beneficiary-duplicate-${index}`
                        : undefined
                  }
                  aria-busy={
                    resolvingId === beneficiaryId || debouncingIds.has(beneficiaryId) || undefined
                  }
                  className={`w-full rounded-lg border ${
                    addressError ? 'border-red-400' : 'border-white/10'
                  } bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none`}
                />
              </div>
              <div className="flex items-end gap-2">
                {isFederatedAddress(beneficiary.address) && (
                  <button
                    type="button"
                    onClick={() => resolveBeneficiaryAddress(index, beneficiary.address)}
                    disabled={resolvingId === beneficiaryId}
                    className="min-h-[48px] whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-will-light/70 transition hover:border-will-purple hover:text-will-light disabled:opacity-40"
                  >
                    Resolve
                  </button>
                )}
                <div className="flex items-end gap-1">
                  <div>
                    <label htmlFor={`beneficiary-percentage-${index}`} className="sr-only">
                      Beneficiary {index + 1} Percentage
                    </label>
                    <input
                      id={`beneficiary-percentage-${index}`}
                      type="number"
                      aria-label={`Beneficiary ${index + 1} Percentage`}
                      min={0}
                      max={100}
                      step={0.01}
                      value={beneficiary.percentage}
                      aria-invalid={hasPrecisionWarning ? 'true' : undefined}
                      aria-describedby={percentageDescribedBy || undefined}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setPrecisionWarnings((prev) => {
                          const next = new Map(prev);
                          if (beneficiaryId && hasExcessPrecision(raw)) next.set(beneficiaryId, raw.trim());
                          else next.delete(beneficiaryId);
                          return next;
                        });
                        if (raw === '') {
                          updateRow(index, { percentage: 0 });
                          return;
                        }
                        const val = Number(raw);
                        // Clamp the range but keep fractions, so a non-integer surfaces the
                        // "whole numbers" validation message instead of being silently truncated.
                        const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
                        // Inputs are restricted to 2 decimal places (the contract's basis-point precision).
                        updateRow(index, { percentage: Math.round(clamped * 100) / 100 });
                      }}
                      className="min-h-[48px] w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-right text-sm text-will-light focus:border-will-purple focus:outline-none"
                    />
                  </div>
                  <span className="text-sm text-will-light/60 pb-2">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove Beneficiary ${index + 1}`}
                  className="min-h-[48px] min-w-[48px] rounded-lg border border-white/10 px-2 py-2 text-will-light/60 transition hover:border-red-400/40 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
            {hasPrecisionWarning && (
              <p
                id={`beneficiary-percentage-warning-${index}`}
                role="status"
                className="ml-1 text-xs text-amber-400"
              >
                {precisionWarnings.get(beneficiaryId)}% has more than 2 decimal places and was rounded to{' '}
                {beneficiary.percentage}%. Adjust the value, or continue with the rounded percentage.
              </p>
            )}
            {resolvedAddresses.has(beneficiaryId) && (
              <div className="ml-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2">
                <p className="text-xs text-emerald-400">Resolved address:</p>
                <p className="font-mono text-xs text-emerald-300 break-all">{resolvedAddresses.get(beneficiaryId)}</p>
              </div>
            )}
            {resolutionError.has(beneficiaryId) && (
              <div className="ml-1 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2">
                <p role="alert" className="text-xs text-red-400">{resolutionError.get(beneficiaryId)}</p>
              </div>
            )}
            {addressError && (
              <p
                id={`beneficiary-address-error-${index}`}
                role="alert"
                aria-live="polite"
                className="ml-1 text-xs text-red-400"
              >
                {addressError}
              </p>
            )}
            {percentageError && (
              <p id={`beneficiary-percentage-error-${index}`} role="alert" className="text-xs text-red-400">
                {percentageError}
              </p>
            )}
            {duplicateRows.has(index) && (
              <p id={`beneficiary-duplicate-${index}`} role="alert" className="ml-1 text-xs text-red-400">
                Duplicate address — already used by beneficiary {(duplicateRows.get(index) ?? 0) + 1}
              </p>
            )}
          </div>
        );
        })}
      </div>

      <div className="space-y-1">
        <p className={`text-sm ${isOverAllocated ? 'text-red-400' : 'text-will-light/70'}`}>
          Total allocated: {total}% of 100%
        </p>
        {isOverAllocated ? (
          <p className="text-xs text-red-400">
            Over-allocated by {Math.round((total - 100) * 100) / 100}% — reduce shares so the total is 100%.
          </p>
        ) : remaining > 0 ? (
          <p className="text-xs text-amber-400">{remaining}% remaining to allocate.</p>
        ) : (
          <p className="text-xs text-emerald-400">Fully allocated.</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const splits = equalSplit(value.length);
            onChange(value.map((b, i) => ({ ...b, percentage: splits[i] })));
          }}
          className="min-h-[48px] flex-1 rounded-lg border border-white/10 py-2 text-sm text-will-light/70 transition hover:border-will-purple hover:text-will-light"
        >
          Split Equally
        </button>
        <button
          type="button"
          onClick={addRow}
          className="min-h-[48px] flex-1 rounded-lg border border-dashed border-white/20 py-2 text-sm text-will-light/70 transition hover:border-will-purple hover:text-will-light"
        >
          + Add Beneficiary
        </button>
      </div>

      <BeneficiaryWhitelistPanel whitelist={whitelist} />

      <button
        type="button"
        disabled={!isValid}
        aria-disabled={!isValid}
        className="w-full rounded-lg bg-will-purple py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save Beneficiaries
      </button>

      <div
        className={`text-sm ${validationMessage === null ? 'text-emerald-400' : 'text-amber-400'}`}
        role="status"
        aria-live="polite"
      >
        {validationMessage === null ? (
          <>Total: {total}% ✓</>
        ) : (
          <>
            Total: {total}% — {validationMessage ?? 'Fix the highlighted address errors'}{' '}
            <a
              href="https://github.com/SoroWill/sorowill-app#beneficiary-percentages"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Learn how percentages work
            </a>
          </>
        )}
      </div>
    </fieldset>
  );
}
