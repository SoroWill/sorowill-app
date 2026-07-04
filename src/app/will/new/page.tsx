'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatUSDC, toStroops, validateBeneficiaries, type Beneficiary } from '@sorowill/sdk';

import { truncateAddress } from '@/lib/freighter';
import { getSoroWillClient } from '@/lib/sorowill';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';

const CHECKIN_OPTIONS = [30, 60, 90, 180, 365];
const GRACE_OPTIONS = [3, 7, 14];

const STEP_LABELS = ['Amount', 'Beneficiaries', 'Timing', 'Guardians', 'Review'];

export default function NewWillPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [token, setToken] = useState('');
  const [amount, setAmount] = useState('');
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([{ address: '', percentage: 100 }]);
  const [checkinPeriodDays, setCheckinPeriodDays] = useState(90);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [guardians, setGuardians] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValid = amount.trim() !== '' && Number(amount) > 0 && token.trim() !== '';
  const beneficiariesValid = validateBeneficiaries(beneficiaries) && beneficiaries.every((b) => b.address.trim() !== '');

  const canGoNext = [amountValid, beneficiariesValid, true, true, true][step];

  function updateGuardian(index: number, address: string) {
    setGuardians((prev) => prev.map((g, i) => (i === index ? address : g)));
  }

  function addGuardian() {
    if (guardians.length < 3) {
      setGuardians((prev) => [...prev, '']);
    }
  }

  function removeGuardian(index: number) {
    setGuardians((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const client = getSoroWillClient();
      const { willId } = await client.createWill({
        token,
        amount: toStroops(amount).toString(),
        beneficiaries,
        checkinPeriodDays,
        gracePeriodDays,
        guardians: guardians.filter((g) => g.trim() !== ''),
      });
      router.push(`/will/${willId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create will');
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Create a will</h1>
        <p className="mt-1 text-sm text-will-light/60">
          Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
        </p>
        <div className="mt-3 flex gap-1.5">
          {STEP_LABELS.map((label, index) => (
            <span
              key={label}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-will-purple' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-will-light">Token contract address</label>
              <input
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="USDC Stellar Asset Contract (C...)"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-will-light">Amount (USDC)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1000.00"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        {step === 1 ? <BeneficiaryForm value={beneficiaries} onChange={setBeneficiaries} /> : null}

        {step === 2 ? (
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-will-light">Check-in period</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHECKIN_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setCheckinPeriodDays(days)}
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
            </div>
            <div>
              <label className="text-sm font-medium text-will-light">Grace period</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {GRACE_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setGracePeriodDays(days)}
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
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-will-light">Guardians (optional, up to 3)</label>
              <button
                type="button"
                onClick={addGuardian}
                disabled={guardians.length >= 3}
                className="text-xs font-medium text-will-purple hover:underline disabled:opacity-40"
              >
                + Add guardian
              </button>
            </div>
            <p className="text-xs text-will-light/50">
              Any 2 of your guardians can force an early release if you&apos;re incapacitated.
            </p>
            {guardians.map((guardian, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={guardian}
                  onChange={(event) => updateGuardian(index, event.target.value)}
                  placeholder="Guardian address (G...)"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeGuardian(index)}
                  aria-label="Remove guardian"
                  className="rounded-lg border border-white/10 px-2 py-2 text-will-light/60 transition hover:border-red-400/40 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4 text-sm">
            <h3 className="font-semibold text-will-light">Review</h3>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-will-light/60">Amount</dt>
                <dd className="text-will-light">
                  {amount ? formatUSDC(toStroops(amount)) : '0.00'} USDC
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
              {guardians.length > 0 ? (
                <div>
                  <dt className="mb-1 text-will-light/60">Guardians</dt>
                  <dd className="space-y-1">
                    {guardians.map((g, i) => (
                      <div key={i} className="font-mono text-xs text-will-light">
                        {g ? truncateAddress(g) : '—'}
                      </div>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="rounded-full border border-white/20 px-5 py-2 text-sm text-will-light/70 transition hover:border-white/40 disabled:opacity-40"
        >
          Back
        </button>
        {step < STEP_LABELS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
            disabled={!canGoNext}
            className="rounded-full bg-will-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-full bg-will-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Will'}
          </button>
        )}
      </div>
    </div>
  );
}
