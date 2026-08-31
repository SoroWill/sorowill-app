'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { formatUSDC, toStroops, validateBeneficiaries, type Beneficiary } from '@sorowill/sdk';

import { truncateAddress, safeGetPublicKey } from '@/lib/freighter';
import { getSoroWillClient } from '@/lib/sorowill';
import { GUARDIAN_THRESHOLD, MAX_GUARDIANS } from '@/lib/constants';
import { formatError } from '@/lib/errors';
import { isFederatedAddress, resolveFederatedAddress } from '@/lib/federated';
import { getUserBalance } from '@/lib/balance';
import { isValidAmount } from '@/lib/amount';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import { validateGuardians } from '@/lib/guardianValidation';

const CHECKIN_OPTIONS = [30, 60, 90, 180, 365];
const GRACE_OPTIONS = [3, 7, 14];

// The contract's persistent storage TTL is bumped to ~60 days' worth of ledgers on each write.
// Check-in periods exceeding this window risk storage archival before the owner's next check-in.
const SAFE_CHECKIN_WINDOW_DAYS = 60;

const STEP_LABELS = ['Amount', 'Beneficiaries', 'Timing', 'Guardians', 'Review'];
const STORAGE_KEY = 'sorowill-form-draft';

interface FormState {
  step: number;
  token: string;
  amount: string;
  beneficiaries: Beneficiary[];
  checkinPeriodDays: number;
  gracePeriodDays: number;
  guardians: string[];
}

/** True when a check-in period exceeds the contract's safe storage TTL window. */
function isUnsafeCheckinPeriod(days: number): boolean {
  return days > SAFE_CHECKIN_WINDOW_DAYS;
}

export function getSubmittedGuardians(
  guardians: string[],
  resolvedGuardians: Map<string, string>,
  guardianIds: Map<number, string>,
): string[] {
  return guardians
    .map((guardian, index) => {
      const id = guardianIds.get(index);
      return (id && resolvedGuardians.get(id)) || guardian;
    })
    .filter((guardian) => guardian.trim() !== '');
}

// Soroban contract strkey: 'C' followed by 55 base32 chars (RFC 4648 alphabet,
// no padding). Catches typos here rather than deep in the SDK at submit time.
const CONTRACT_ADDRESS_PATTERN = /^C[A-Z2-7]{55}$/;

export default function NewWillPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneFromId = searchParams.get('cloneFrom');
  const [step, setStep] = useState(0);

  const [token, setToken] = useState('');
  const [amount, setAmount] = useState('');
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([{ address: '', percentage: 100 }]);
  const [checkinPeriodDays, setCheckinPeriodDays] = useState(90);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [guardians, setGuardians] = useState<string[]>([]);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);

  const [guardianIds, setGuardianIds] = useState<Map<number, string>>(new Map());

  const stableGuardianIds = useMemo(() => {
    const newIds = new Map(guardianIds);
    guardians.forEach((_, index) => {
      if (!newIds.has(index)) {
        newIds.set(index, crypto.randomUUID());
      }
    });
    setGuardianIds(newIds);
    return newIds;
  }, [guardians.length]);

  const [resolvedGuardians, setResolvedGuardians] = useState<Map<string, string>>(new Map());
  const [resolvingGuardianId, setResolvingGuardianId] = useState<string | null>(null);
  const [guardianResolutionError, setGuardianResolutionError] = useState<Map<string, string>>(
    new Map(),
  );

  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the connected wallet address once so we can reject it as a guardian.
  useEffect(() => {
    void safeGetPublicKey().then(setOwnerAddress);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (draft && !cloneFromId) {
        try {
          setResumeAvailable(true);
        } catch {
          setResumeAvailable(false);
        }
      }
    }
  }, [cloneFromId]);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        setLoadingBalance(true);
        const publicKey = await safeGetPublicKey();
        if (publicKey) {
          const balance = await getUserBalance(publicKey);
          setWalletBalance(balance);
        }
      } catch {
        setWalletBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };

    void fetchBalance();
  }, []);

  useEffect(() => {
    if (cloneFromId) {
      setCloneLoading(true);
      getSoroWillClient()
        .getWill(cloneFromId)
        .then((sourceWill) => {
          setToken(sourceWill.token);
          setBeneficiaries(sourceWill.beneficiaries);
          setCheckinPeriodDays(sourceWill.checkinPeriodDays);
          setGracePeriodDays(sourceWill.gracePeriodDays);
          setGuardians(sourceWill.guardians);
          setCloneLoading(false);
        })
        .catch((err) => {
          setError(formatError(err));
          setCloneLoading(false);
        });
    }
  }, [cloneFromId]);

  const tokenValid = CONTRACT_ADDRESS_PATTERN.test(token.trim());
  const showTokenError = token.trim() !== '' && !tokenValid;
  const isAmountValid = isValidAmount(amount) && tokenValid;
  useEffect(() => {
    const state: FormState = {
      step,
      token,
      amount,
      beneficiaries,
      checkinPeriodDays,
      gracePeriodDays,
      guardians,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [step, token, amount, beneficiaries, checkinPeriodDays, gracePeriodDays, guardians]);

  function resumeDraft() {
    if (typeof window !== 'undefined') {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (draft) {
        try {
          const state: FormState = JSON.parse(draft);
          setStep(state.step);
          setToken(state.token);
          setAmount(state.amount);
          setBeneficiaries(state.beneficiaries);
          setCheckinPeriodDays(state.checkinPeriodDays);
          setGracePeriodDays(state.gracePeriodDays);
          setGuardians(state.guardians);
          setResumeAvailable(false);
        } catch {
          setError('Failed to resume draft');
        }
      }
    }
  }

  function setMaxAmount() {
    if (walletBalance) {
      setAmount(walletBalance);
    }
  }

  const beneficiariesValid =
    validateBeneficiaries(beneficiaries) &&
    beneficiaries.every((b) => b.address.trim() !== '') &&
    // Block progression if any beneficiary still holds an unresolved federated address.
    // The user must click "Resolve" before the address is replaced with the real G... key.
    beneficiaries.every((b) => !isFederatedAddress(b.address));

  const { rowErrors: guardianRowErrors, topError: guardianTopError } = validateGuardians(guardians, ownerAddress);
  // Step 3 is valid when there are no row-level errors (blank rows are a
  // warning, not a blocking error — the user sees the warning and can proceed).
  const guardiansValid = guardianTopError === null;

  const canGoNext = [isAmountValid, beneficiariesValid, true, guardiansValid, true][step];

  // Rows that are blank — the user will see a warning that they'll be dropped.
  const blankGuardianIndices = guardians
    .map((g, i) => (g.trim() === '' ? i : -1))
    .filter((i) => i !== -1);

  const guardianBeneficiaryOverlap = useMemo(() => {
    const beneficiaryAddresses = new Set(
      beneficiaries.map((b) => b.address.trim()).filter((a) => a !== ''),
    );
    if (beneficiaryAddresses.size === 0) return [];

    const overlapped = new Set<string>();
    guardians.forEach((g, i) => {
      const trimmed = g.trim();
      if (trimmed === '') return;

      if (beneficiaryAddresses.has(trimmed)) {
        overlapped.add(trimmed);
        return;
      }

      const id = stableGuardianIds.get(i);
      const resolved = id ? resolvedGuardians.get(id) : undefined;
      if (resolved && beneficiaryAddresses.has(resolved)) {
        overlapped.add(trimmed);
      }
    });

    return [...overlapped];
  }, [guardians, beneficiaries, resolvedGuardians, stableGuardianIds]);

  function updateGuardian(index: number, address: string) {
    setGuardians((prev) => prev.map((g, i) => (i === index ? address : g)));
    const id = stableGuardianIds.get(index);
    if (id) {
      setResolvedGuardians((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setGuardianResolutionError((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function resolveGuardianAddress(index: number, address: string) {
    const id = stableGuardianIds.get(index);
    if (!id) return;

    if (!isFederatedAddress(address)) {
      setResolvedGuardians((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setGuardianResolutionError((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    setResolvingGuardianId(id);
    try {
      const resolved = await resolveFederatedAddress(address);
      setResolvedGuardians((prev) => new Map(prev).set(id, resolved));
      setGuardianResolutionError((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setGuardianResolutionError(
        (prev) =>
          new Map(prev).set(
            id,
            formatError(err),
          ),
      );
      setResolvedGuardians((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setResolvingGuardianId(null);
    }
  }

  function addGuardian() {
    if (guardians.length < MAX_GUARDIANS) {
      setGuardians((prev) => [...prev, '']);
    }
  }

  function removeGuardian(index: number) {
    setGuardians((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    
    // Validate guardians before submission
    if (guardianTopError !== null) {
      setError('Please fix the guardian address errors before submitting.');
      setSubmitting(false);
      return;
    }

    // Defense-in-depth: block submission if any beneficiary address is still a
    // federated address string. The user must resolve it to a real G... key first.
    const unresolvedFederated = beneficiaries.filter((b) => isFederatedAddress(b.address));
    if (unresolvedFederated.length > 0) {
      setError(
        'One or more beneficiary addresses are still federated addresses. Please resolve them to Stellar addresses before submitting.',
      );
      setSubmitting(false);
      return;
    }
    
    try {
      const client = getSoroWillClient();
      const { willId } = await client.createWill({
        token,
        amount: toStroops(amount).toString(),
        beneficiaries,
        checkinPeriodDays,
        gracePeriodDays,
        guardians: getSubmittedGuardians(guardians, resolvedGuardians, stableGuardianIds),
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      router.push(`/will/${willId}`);
    } catch (err) {
      setError(formatError(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 sm:space-y-8 sm:px-0">
      <div>
        <h1 className="text-xl font-bold text-will-light sm:text-2xl">Create a will</h1>
        <p className="mt-1 text-xs text-will-light/60 sm:text-sm">
          Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
        </p>
        <div className="mt-3 flex gap-1.5">
          {STEP_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (index <= step) {
                  setStep(index);
                }
              }}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-will-purple cursor-pointer hover:opacity-80' : 'bg-white/10 cursor-not-allowed'}`}
              aria-label={index <= step ? `Go to step ${index + 1}: ${label}` : undefined}
            />
          ))}
        </div>
      </div>

      {resumeAvailable && (
        <div className="rounded-xl border border-will-purple/40 bg-will-purple/10 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-will-light">Draft found</p>
              <p className="text-xs text-will-light/60">You have an unsaved form in progress</p>
            </div>
            <button
              type="button"
              onClick={resumeDraft}
              className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {cloneLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-will-light/70">Loading will to duplicate...</p>
        </div>
      )}

      {!cloneLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="token-address" className="text-sm font-medium text-will-light">
                Token contract address
              </label>
              <input
                id="token-address"
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="USDC Stellar Asset Contract (C...)"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
                aria-describedby="token-help token-error"
                aria-invalid={showTokenError}
              />
              {showTokenError ? (
                <p id="token-error" role="alert" className="mt-1 text-xs text-red-400">
                  That doesn&apos;t look like a Stellar contract address. It should start with
                  &quot;C&quot; and be 56 characters long.
                </p>
              ) : null}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="amount" className="text-sm font-medium text-will-light">
                  Amount (USDC)
                </label>
                {walletBalance && (
                  <div className="text-xs text-will-light/60">
                    Balance: {loadingBalance ? '...' : walletBalance}
                  </div>
                )}
              </div>
              <div className="relative mt-1 flex items-center">
                <input
                  id="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(event) => {
                    const val = event.target.value;
                    if (val !== '' && Number(val) < 0) {
                      setAmount('0');
                    } else {
                      setAmount(val);
                    }
                  }}
                  placeholder="1000.00"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
                  aria-describedby="amount-help"
                />
                {walletBalance && (
                  <button
                    type="button"
                    onClick={setMaxAmount}
                    className="absolute right-2 rounded px-2 py-1 text-xs font-medium text-will-purple hover:bg-white/5"
                  >
                    Max
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? <BeneficiaryForm value={beneficiaries} onChange={setBeneficiaries} /> : null}

        {step === 2 ? (
          <fieldset className="space-y-6">
            <div>
              <legend className="text-sm font-medium text-will-light">Check-in period</legend>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Check-in period options">
                {CHECKIN_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setCheckinPeriodDays(days)}
                    aria-pressed={checkinPeriodDays === days}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      checkinPeriodDays === days
                        ? 'bg-will-purple text-white'
                        : 'border border-white/20 text-will-light/70 hover:border-white/40'
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <label htmlFor="custom-checkin" className="text-xs text-will-light/70">
                  Or enter a custom value (in days):
                </label>
                <input
                  id="custom-checkin"
                  type="number"
                  min={1}
                  max={3650}
                  value={checkinPeriodDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      setCheckinPeriodDays(val);
                    }
                  }}
                  placeholder="Enter days"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
                />
              </div>
              {isUnsafeCheckinPeriod(checkinPeriodDays) && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-3" role="status">
                  <p className="text-xs font-medium text-amber-400">Storage archival risk</p>
                  <p className="mt-1 text-xs text-amber-400/90">
                    This {checkinPeriodDays}-day check-in period exceeds the contract&apos;s storage safety window ({SAFE_CHECKIN_WINDOW_DAYS} days). Your will&apos;s on-chain data may be archived before your next check-in, making it inaccessible. Consider choosing a shorter period, or plan to check in more frequently.
                  </p>
                </div>
              )}
            </div>
            <div>
              <legend className="text-sm font-medium text-will-light">Grace period</legend>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Grace period options">
                {GRACE_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setGracePeriodDays(days)}
                    aria-pressed={gracePeriodDays === days}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      gracePeriodDays === days
                        ? 'bg-will-purple text-white'
                        : 'border border-white/20 text-will-light/70 hover:border-white/40'
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <label htmlFor="custom-grace" className="text-xs text-will-light/70">
                  Or enter a custom value (in days):
                </label>
                <input
                  id="custom-grace"
                  type="number"
                  min={1}
                  max={3650}
                  value={gracePeriodDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      setGracePeriodDays(val);
                    }
                  }}
                  placeholder="Enter days"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
                />
              </div>
            </div>
          </fieldset>
        ) : null}

        {step === 3 ? (
          <fieldset className="space-y-3">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium text-will-light">Guardians (optional, up to {MAX_GUARDIANS})</legend>
              <button
                type="button"
                onClick={addGuardian}
                disabled={guardians.length >= MAX_GUARDIANS}
                aria-label={`Add guardian (${guardians.length} of ${MAX_GUARDIANS})`}
                className="text-xs font-medium text-will-purple hover:underline disabled:opacity-40"
              >
                + Add guardian
              </button>
            </div>
            <p className="text-xs text-will-light/50">
              Any {GUARDIAN_THRESHOLD} of your guardians can force an early release if you&apos;re incapacitated.
            </p>

            {guardians.map((guardian, index) => {
              const guardianId = stableGuardianIds.get(index) || '';
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
                    onChange={(event) => updateGuardian(index, event.target.value)}
                    placeholder="Guardian address (G...) or federated address (name*domain.com)"
                    aria-describedby={guardianRowErrors[index] ? `guardian-error-${index}` : undefined}
                    aria-invalid={guardianRowErrors[index] ? 'true' : undefined}
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:outline-none ${
                      guardianRowErrors[index]
                        ? 'border-red-400/60 bg-red-500/5 focus:border-red-400'
                        : guardian.trim() === '' && guardians.length > 0
                        ? 'border-amber-400/40 bg-white/5 focus:border-will-purple'
                        : 'border-white/10 bg-white/5 focus:border-will-purple'
                    }`}
                  />
                  {isFederatedAddress(guardian) && (
                    <button
                      type="button"
                      onClick={() => resolveGuardianAddress(index, guardian)}
                      disabled={resolvingGuardianId === guardianId}
                      className="whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-will-light/70 transition hover:border-will-purple hover:text-will-light disabled:opacity-40"
                    >
                      {resolvingGuardianId === guardianId ? 'Resolving…' : 'Resolve'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeGuardian(index)}
                    aria-label={`Remove guardian ${index + 1}`}
                    className="rounded-lg border border-white/10 px-2 py-2 text-will-light/60 transition hover:border-red-400/40 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
                {resolvedGuardians.has(guardianId) && (
                  <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2">
                    <p className="text-xs text-emerald-400">Resolved address:</p>
                    <p className="font-mono text-xs text-emerald-300">{resolvedGuardians.get(guardianId)}</p>
                  </div>
                )}
                {guardianResolutionError.has(guardianId) && (
                  <div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2">
                    <p className="text-xs text-red-400">{guardianResolutionError.get(guardianId)}</p>
                  </div>
                )}
                {/* Per-row validation errors */}
                {guardianRowErrors[index] ? (
                  <p id={`guardian-error-${index}`} className="text-xs text-red-400" role="alert">
                    {guardianRowErrors[index]}
                  </p>
                ) : null}
                {/* Blank-row warning — shown only when there are no other errors for this row */}
                {!guardianRowErrors[index] && guardian.trim() === '' ? (
                  <p className="text-xs text-amber-400/80">
                    This empty row will be excluded when the will is submitted.
                  </p>
                ) : null}
              </div>
            );
            })}

            {/* Top-level validation error when guardians have issues */}
            {guardianTopError && (
              <p className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-400" role="alert">
                {guardianTopError}
              </p>
            )}

            {/* Summary warning when blank rows exist alongside valid rows */}
            {blankGuardianIndices.length > 0 && guardians.some((g) => g.trim() !== '') ? (
              <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400" role="status">
                {blankGuardianIndices.length === 1
                  ? '1 empty guardian row will not be included in the will.'
                  : `${blankGuardianIndices.length} empty guardian rows will not be included in the will.`}
              </p>
            ) : null}

            {guardianBeneficiaryOverlap.length > 0 ? (
              <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400" role="status">
                {guardianBeneficiaryOverlap.length === 1
                  ? '1 guardian is also listed as a beneficiary — this changes who can vote to trigger an early release of funds they themselves stand to receive.'
                  : `${guardianBeneficiaryOverlap.length} guardians are also listed as beneficiaries — this changes who can vote to trigger an early release of funds they themselves stand to receive.`}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4 text-sm">
            <h3 className="font-semibold text-will-light">Review</h3>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-will-light/60">Amount</dt>
                <dd className="text-will-light">
                  {(() => {
                    try {
                      return amount ? formatUSDC(toStroops(amount)) : '0.00';
                    } catch {
                      return '0.00';
                    }
                  })()} USDC
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-will-light/60">Check-in period</dt>
                <dd className="text-will-light">{checkinPeriodDays} days</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-will-light/60">Grace period</dt>
                <dd className="text-will-light">{gracePeriodDays} days</dd>
              </div>
              <div>
                <dt className="mb-1 text-will-light/60">Beneficiaries</dt>
                <dd className="space-y-1">
                  {beneficiaries.map((b, i) => (
                    <div key={i} className="flex justify-between font-mono text-xs text-will-light">
                      <span>{b.address ? truncateAddress(b.address) : '—'}</span>
                      <span>{b.percentage}%</span>
                    </div>
                  ))}
                </dd>
              </div>
              {guardians.filter((g) => g.trim() !== '').length > 0 ? (
                <div>
                  <dt className="mb-1 text-will-light/60">Guardians</dt>
                  <dd className="space-y-1">
                    {guardians
                      .filter((g) => g.trim() !== '')
                      .map((g, i) => (
                        <div key={i} className="font-mono text-xs text-will-light">
                          {truncateAddress(g)}
                        </div>
                      ))}
                  </dd>
                  <p className="mt-2 text-xs text-will-light/50">
                    Any {GUARDIAN_THRESHOLD} of your guardians can force an early release if you&apos;re incapacitated.
                  </p>
                  {guardianBeneficiaryOverlap.length > 0 ? (
                    <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400" role="status">
                      {guardianBeneficiaryOverlap.length === 1
                        ? '1 guardian is also listed as a beneficiary — this changes who can vote to trigger an early release of funds they themselves stand to receive.'
                        : `${guardianBeneficiaryOverlap.length} guardians are also listed as beneficiaries — this changes who can vote to trigger an early release of funds they themselves stand to receive.`}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
        </div>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="w-full rounded-full border border-white/20 px-5 py-2 text-sm text-will-light/70 transition hover:border-white/40 disabled:opacity-40 sm:w-auto"
        >
          Back
        </button>
        {step < STEP_LABELS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
            disabled={!canGoNext}
            className="w-full rounded-full bg-will-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || guardianTopError !== null}
            className="w-full rounded-full bg-will-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? 'Creating…' : 'Create Will'}
          </button>
        )}
      </div>
    </div>
  );
}
