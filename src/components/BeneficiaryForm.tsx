'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Beneficiary } from '@sorowill/sdk';

import { isFederatedAddress, resolveFederatedAddress } from '@/lib/federated';
import { formatError } from '@/lib/errors';
import { validateBeneficiaryPercentages } from '@/lib/beneficiaryValidation';

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
    } else if (b.address && isFederatedAddress(b.address)) {
      errors[i] = 'Federated address must be resolved before submitting — click Resolve';
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

export function BeneficiaryForm({ value, onChange }: BeneficiaryFormProps) {
  const validation = validateBeneficiaryPercentages(value);
  const total = validation.totalPercentage;
  const validationMessage = validation.message;
  const isValid = validation.isValid;
  const hasRoundingWarning = validation.hasRoundingWarning;
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
          aria-label="Split equally — distribute percentages equally among all beneficiaries"
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
                    min={0}
                    max={100}
                    step="0.01"
                    value={beneficiary.percentage}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === '') {
                        updateRow(index, { percentage: 0 });
                        return;
                      }
                      const val = Number(raw);
                      const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
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
              <p id={`beneficiary-address-error-${index}`} role="alert" className="text-xs text-red-400">
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

      {hasRoundingWarning && isValid && (
        <p
          className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400"
          role="note"
        >
          Note: Decimal percentages are encoded into basis points for contract execution, which may slightly adjust distribution rounding.
        </p>
      )}

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
