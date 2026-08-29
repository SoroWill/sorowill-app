'use client';

import { useState, useMemo } from 'react';

import type { Beneficiary } from '@sorowill/sdk';

import { isFederatedAddress, resolveFederatedAddress } from '@/lib/federated';
import { formatError } from '@/lib/errors';

export interface BeneficiaryFormProps {
  value: Beneficiary[];
  onChange: (beneficiaries: Beneficiary[]) => void;
}

function isValidStellarAddress(address: string): boolean {
  if (!address) return false;
  return /^G[0-9A-Z]{55}$/.test(address);
}

function getAddressErrors(beneficiaries: Beneficiary[]): Record<number, string> {
  const errors: Record<number, string> = {};
  beneficiaries.forEach((b, i) => {
    if (b.percentage > 0 && !b.address.trim()) {
      errors[i] = 'Address is required';
    } else if (b.address && !isFederatedAddress(b.address) && !isValidStellarAddress(b.address)) {
      errors[i] = 'Invalid Stellar address';
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
 * Returns a human-readable validation message for the current beneficiary
 * list, or `null` when the list is valid.
 *
 * Two distinct failure modes are distinguished:
 *  1. Any percentage is non-integer   → "Percentages must be whole numbers"
 *  2. Sum is not 100 (but all integers) → "Total must equal 100%"
 */
function getBeneficiaryValidationMessage(beneficiaries: Beneficiary[]): string | null {
  if (beneficiaries.length === 0) {
    return 'Add at least one beneficiary';
  }

  const hasInvalidRange = beneficiaries.some((b) => b.percentage < 0 || b.percentage > 100);
  if (hasInvalidRange) {
    return 'Percentages must be between 0% and 100%';
  }

  const hasNonInteger = beneficiaries.some((b) => !Number.isInteger(b.percentage));
  if (hasNonInteger) {
    return 'Percentages must be whole numbers (e.g. 33, not 33.5)';
  }

  const total = beneficiaries.reduce((sum, b) => sum + b.percentage, 0);
  if (total !== 100) {
    return `Total must equal 100% (currently ${total}%)`;
  }

  return null;
}

export function BeneficiaryForm({ value, onChange }: BeneficiaryFormProps) {
  const total = value.reduce((sum, b) => sum + b.percentage, 0);
  const validationMessage = getBeneficiaryValidationMessage(value);
  const isValid = validationMessage === null;
  const addressErrors = getAddressErrors(value);

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
                  placeholder="Stellar address (G...) or federated address (name*domain.com)"
                  value={beneficiary.address}
                  onChange={(event) => updateRow(index, { address: event.target.value })}
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
                    min={0}
                    max={100}
                    value={beneficiary.percentage}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === '') {
                        updateRow(index, { percentage: 0 });
                        return;
                      }
                      const val = Number(raw);
                      const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(100, Math.floor(val)));
                      updateRow(index, { percentage: clamped });
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
              <p className="text-xs text-red-400">
                {addressErrors[index]}
              </p>
            )}
          </div>
        );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-lg border border-dashed border-white/20 py-2 text-sm text-will-light/70 transition hover:border-will-purple hover:text-will-light"
      >
        + Add beneficiary
      </button>

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
