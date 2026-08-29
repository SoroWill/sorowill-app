'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { type Will, formatUSDC } from '@sorowill/sdk';
import { getSoroWillClient } from '@/lib/sorowill';
import { safeGetPublicKey, truncateAddress } from '@/lib/freighter';
import { formatError } from '@/lib/errors';
import { GUARDIAN_THRESHOLD } from '@/lib/constants';

function OnboardContent() {
  const searchParams = useSearchParams();
  const willId = searchParams.get('willId');

  const [will, setWill] = useState<Will | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    void safeGetPublicKey().then(setPublicKey);
  }, []);

  useEffect(() => {
    if (!willId) return;

    setLoading(true);
    setError(null);
    getSoroWillClient()
      .getWill(willId)
      .then((fetched) => {
        setWill(fetched);
      })
      .catch((err) => {
        setError(formatError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [willId]);

  const isGuardian = will && publicKey && will.guardians.includes(publicKey);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-will-light">
          Guardian Onboarding
        </h1>
        <p className="mt-2 text-sm text-will-light/60">
          Learn about your role and responsibilities as a designated guardian in the SoroWill protocol.
        </p>
      </div>

      {/* Role explanation */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-will-light">What is a Guardian?</h2>
        <p className="text-sm text-will-light/70 leading-relaxed">
          As a guardian, you have been trusted to oversee a SoroWill inheritance plan. You do not own the funds, nor can you steal them. Instead, your job is to serve as a keyholder who can verify if the will owner is still active.
        </p>

        <div className="grid gap-4 mt-4 sm:grid-cols-2">
          <div className="p-4 rounded-lg bg-white/5 border border-white/5">
            <h3 className="text-sm font-semibold text-will-light">1. missed check-ins</h3>
            <p className="mt-1 text-xs text-will-light/60">
              If the owner misses their check-in, anyone can trigger the grace period. You should stay in contact to check if they are okay.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/5">
            <h3 className="text-sm font-semibold text-will-light">2. Quorum release</h3>
            <p className="mt-1 text-xs text-will-light/60">
              If needed, any {GUARDIAN_THRESHOLD} of the designated guardians can vote to release the inheritance early, bypassing the remaining grace period.
            </p>
          </div>
        </div>
      </section>

      {/* Will details if query param exists */}
      {willId && (
        <section className="rounded-xl border border-will-purple/30 bg-will-purple/5 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-will-light">Details for Will #{willId}</h2>

          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-white/10 rounded w-1/3"></div>
              <div className="h-4 bg-white/10 rounded w-1/2"></div>
            </div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : will ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <div className="p-3 bg-white/5 rounded-lg">
                  <span className="text-xs text-will-light/50 block">Owner Address</span>
                  <span className="font-mono text-will-light block truncate mt-1">
                    {truncateAddress(will.owner)}
                  </span>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <span className="text-xs text-will-light/50 block">Locked Balance</span>
                  <span className="font-semibold text-will-light block mt-1">
                    {formatUSDC(BigInt(will.balance))} USDC
                  </span>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <span className="text-xs text-will-light/50 block">Check-in period</span>
                  <span className="text-will-light block mt-1">
                    {will.checkinPeriodDays} Days
                  </span>
                </div>
              </div>

              {publicKey ? (
                isGuardian ? (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300 text-sm">
                    ✓ Your connected wallet ({truncateAddress(publicKey)}) is registered as a guardian for this will.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-300 text-sm">
                    ⚠️ Your connected wallet ({truncateAddress(publicKey)}) is NOT a guardian for this will. Make sure you are using the correct account.
                  </div>
                )
              ) : (
                <p className="text-xs text-will-light/50">
                  Connect your wallet using the button in the header to check if you are a guardian for this will.
                </p>
              )}

              <div className="flex gap-4">
                <Link
                  href={`/will/${willId}`}
                  className="rounded-full bg-will-purple px-5 py-2 text-sm font-semibold text-white transition hover:bg-will-purple/90"
                >
                  Go to Will #{willId} Detail Page
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* General actions */}
      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <Link
          href="/dashboard"
          className="text-sm text-will-light/60 hover:text-will-light transition"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function GuardianOnboardingPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-will-light/60">Loading onboarding...</div>}>
      <OnboardContent />
    </Suspense>
  );
}
