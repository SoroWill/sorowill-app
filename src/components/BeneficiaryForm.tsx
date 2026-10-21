'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Beneficiary } from '@sorowill/sdk';

import { isFederatedAddress, resolveFederatedAddress } from '@/lib/federated';
import { formatError } from '@/lib/errors';

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

function getAddressErrors(
  beneficiaries: Beneficiary[],
  addressType: BeneficiaryAddressType = 'account',
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
      errors[i] = getAddressTypeMismatchError(b.address, addressType) ?? 'Invalid Stellar address';
    }
  });
  return errors;
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
    return `Total must equal 100% (currently ${total}%)`;
  }

  return null;
}

export function BeneficiaryForm({ value, onChange, addressType = 'account' }: BeneficiaryFormProps) {
  // Derived validation only depends on `value`; memoize so unrelated re-renders
  // (e.g. resolution state changes) don't re-validate large beneficiary lists.
  const total = useMemo(() => sumPercentages(value), [value]);
  const validationMessage = useMemo(() => getBeneficiaryValidationMessage(value), [value]);
  const isValid = validationMessage === null;
  const addressErrors = useMemo(() => getAddressErrors(value, addressType), [value, addressType]);

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
  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  const [resolvedAddresses, setResolvedAddresses] = useState<Map<string, string>>(new Map());
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<Map<string, string>>(new Map());

  function updateRow(index: number, patch: Partial<Beneficiary>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    if (patch.address !== undefined) {
      const id = stableBeneficiaryIds.get(index);
      if (id) {
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

    setResolvingId(id);
    try {
      const resolved = await resolveFederatedAddress(address);
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
      setResolvingId(null);
    }
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
        <legend className="text-sm font-semibold text-will-light">Beneficiaries</legend>
        <button
          type="button"
          onClick={applyEqualSplit}
          disabled={value.length === 0}
          aria-label="Distribute percentages equally among all beneficiaries"
          className="text-xs font-medium text-will-purple hover:underline disabled:opacity-40"
        >
          Split equally
        </button>
      </div>

      <div className="space-y-2" role="group" aria-label="Beneficiary list">
        {value.map((beneficiary, index) => {
          const beneficiaryId = stableBeneficiaryIds.get(index) || '';
          return (
          <div key={beneficiaryId} className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`beneficiary-address-${index}`} className="sr-only">
                  Beneficiary {index + 1} address
                </label>
                <input
                  id={`beneficiary-address-${index}`}
                  type="text"
                  aria-label={`Beneficiary ${index + 1} address`}
                  placeholder="Stellar address (G...) or federated address (name*domain.com)"
                  value={beneficiary.address}
                  onChange={(event) => updateRow(index, { address: event.target.value })}
                  aria-invalid={addressErrors[index] ? 'true' : undefined}
                  aria-describedby={addressErrors[index] ? `beneficiary-address-error-${index}` : undefined}
                  className={`w-full rounded-lg border ${
                    addressErrors[index] ? 'border-red-400' : 'border-white/10'
                  } bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none`}
                />
              </div>
              {isFederatedAddress(beneficiary.address) && (
                <button
                  type="button"
                  onClick={() => resolveBeneficiaryAddress(index, beneficiary.address)}
                  disabled={resolvingId === beneficiaryId}
                  className="whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-will-light/70 transition hover:border-will-purple hover:text-will-light disabled:opacity-40"
                >
                  {resolvingId === beneficiaryId ? 'Resolving…' : 'Resolve'}
                </button>
              )}
              <div className="flex items-end gap-1">
                <div>
                  <label htmlFor={`beneficiary-percentage-${index}`} className="sr-only">
                    Beneficiary {index + 1} percentage
                  </label>
                  <input
                    id={`beneficiary-percentage-${index}`}
                    type="number"
                    aria-label={`Beneficiary ${index + 1} percentage`}
                    min={0}
                    max={100}
                    step={0.01}
                    value={beneficiary.percentage}
                    onChange={(event) => {
                      const raw = event.target.value;
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
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-right text-sm text-will-light focus:border-will-purple focus:outline-none"
                  />
                </div>
                <span className="text-sm text-will-light/60 pb-2">%</span>
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label={`Remove beneficiary ${index + 1}`}
                className="rounded-lg border border-white/10 px-2 py-2 text-will-light/60 transition hover:border-red-400/40 hover:text-red-400"
              >
                ✕
              </button>
            </div>
            {resolvedAddresses.has(beneficiaryId) && (
              <div className="ml-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2">
                <p className="text-xs text-emerald-400">Resolved address:</p>
                <p className="font-mono text-xs text-emerald-300">{resolvedAddresses.get(beneficiaryId)}</p>
              </div>
            )}
            {resolutionError.has(beneficiaryId) && (
              <div className="ml-1 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2">
                <p className="text-xs text-red-400">{resolutionError.get(beneficiaryId)}</p>
              </div>
            )}
            {addressErrors[index] && (
              <p id={`beneficiary-address-error-${index}`} role="alert" className="text-xs text-red-400">
                {addressErrors[index]}
              </p>
            )}
          </div>
        );
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const splits = equalSplit(value.length);
            onChange(value.map((b, i) => ({ ...b, percentage: splits[i] })));
          }}
          className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-will-light/70 transition hover:border-will-purple hover:text-will-light"
        >
          Split equally
        </button>
        <button
          type="button"
          onClick={addRow}
          className="flex-1 rounded-lg border border-dashed border-white/20 py-2 text-sm text-will-light/70 transition hover:border-will-purple hover:text-will-light"
        >
          + Add beneficiary
        </button>
      </div>

      <div
        className={`text-sm ${isValid ? 'text-emerald-400' : 'text-amber-400'}`}
        role="status"
        aria-live="polite"
      >
        {isValid ? (
          <>Total: {total}% ✓</>
        ) : (
          <>Total: {total}% — {validationMessage}</>
        )}
      </div>
    </fieldset>
  );
}
