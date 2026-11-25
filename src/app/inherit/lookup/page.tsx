'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { formatUSDC, type Will } from '@sorowill/sdk';

import {
  BENEFICIARY_PAGE_SIZE,
  beneficiaryShareOf,
  claimHref,
  findWillsForBeneficiary,
  isValidLookupAddress,
  normalizeLookupAddress,
  paginateWills,
} from '@/lib/beneficiaryLookup';
import { formatError } from '@/lib/errors';
import { safeGetPublicKey, truncateAddress } from '@/lib/freighter';
import { getWillsByBeneficiary } from '@/lib/sorowill';
import { getSafeBalance } from '@/lib/tokenDecimals';
import { StatusBanner } from '@/components/StatusBanner';

type LookupState = 'idle' | 'loading' | 'done' | 'error';

/**
 * Beneficiary lookup (issue #876).
 *
 * Beneficiaries usually know their own address but not the will IDs they are
 * named in. This page scans the contract for wills naming the entered address,
 * shows the matches with the beneficiary's share, and links each one to the
 * claim flow. Long result lists are paginated client-side.
 */
export default function BeneficiaryLookupPage() {
  const [address, setAddress] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [wills, setWills] = useState<Will[]>([]);
  const [state, setState] = useState<LookupState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [partialScan, setPartialScan] = useState(false);
  const [page, setPage] = useState(1);
  const [prefilled, setPrefilled] = useState(false);

  // Offer the connected wallet's address as the default, since the viewer is
  // normally the beneficiary themselves.
  useEffect(() => {
    void safeGetPublicKey().then((key) => {
      if (!key) return;
      setAddress((current) => {
        if (current !== '' || prefilled) return current;
        setPrefilled(true);
        return key;
      });
    });
  }, [prefilled]);

  const runLookup = useCallback(async (raw: string) => {
    const target = normalizeLookupAddress(raw);
    if (!isValidLookupAddress(target)) {
      setError('Enter a valid Stellar address (it starts with G and has 56 characters).');
      setState('error');
      setWills([]);
      setSubmitted(null);
      return;
    }

    setState('loading');
    setError(null);
    setWills([]);
    setSubmitted(target);
    setPage(1);

    try {
      const result = await getWillsByBeneficiary(target);
      setWills(findWillsForBeneficiary(result.wills, target));
      setPartialScan(result.hasErrors);
      setState('done');
    } catch (err) {
      setState('error');
      setError(formatError(err));
    }
  }, []);

  const matches = useMemo(
    () => (submitted ? findWillsForBeneficiary(wills, submitted) : []),
    [wills, submitted],
  );
  const currentPage = useMemo(() => paginateWills(matches, page, BENEFICIARY_PAGE_SIZE), [matches, page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Find wills you inherit</h1>
        <p className="mt-1 text-sm text-will-light/60">
          Look up every will that names a Stellar address as a beneficiary, then review and claim
          your share.
        </p>
      </div>

      <form
        className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void runLookup(address);
        }}
      >
        <label htmlFor="beneficiary-address" className="block text-sm font-medium text-will-light">
          Beneficiary address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="beneficiary-address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="G..."
            autoComplete="off"
            spellCheck={false}
            aria-invalid={state === 'error' ? 'true' : undefined}
            aria-describedby={error ? 'beneficiary-address-error' : undefined}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
          />
          <button
            type="submit"
            disabled={state === 'loading'}
            className="rounded-full bg-will-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === 'loading' ? 'Searching…' : 'Find wills'}
          </button>
        </div>
        {error ? (
          <p id="beneficiary-address-error" role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
      </form>

      <div aria-live="polite">
        {state === 'loading' ? (
          <div className="space-y-3" aria-label="Searching for wills">
            <div className="skeleton h-20 w-full rounded-xl" />
            <div className="skeleton h-20 w-full rounded-xl" />
          </div>
        ) : null}

        {partialScan && state === 'done' ? (
          <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            Some wills could not be read from the network. Results may be incomplete — try again in a
            moment.
          </p>
        ) : null}

        {state === 'done' && matches.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-will-light/60">
            <p className="font-medium text-will-light">No wills found for this address</p>
            <p className="mt-1">
              Double-check the address, or ask the will&apos;s owner to confirm you are listed as a
              beneficiary.
            </p>
          </div>
        ) : null}

        {state === 'done' && matches.length > 0 ? (
          <>
            <p className="mb-3 text-sm text-will-light/60">
              {matches.length} {matches.length === 1 ? 'will' : 'wills'} found for{' '}
              <span className="font-mono text-will-light">{truncateAddress(submitted ?? '')}</span>
              {' · '}
              showing {currentPage.from}–{currentPage.to}
            </p>

            <ul className="space-y-3">
              {currentPage.items.map((will) => {
                const share = beneficiaryShareOf(will, submitted ?? '');
                return (
                  <li
                    key={will.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/will/${will.id}`}
                          className="font-semibold text-will-light hover:underline"
                        >
                          Will #{will.id}
                        </Link>
                        <StatusBanner status={will.status} compact />
                      </div>
                      <p className="text-sm text-will-light/70">
                        {formatUSDC(getSafeBalance(will.balance))} USDC locked
                        {share === null ? null : ` · your share ${share}%`}
                      </p>
                    </div>
                    <Link
                      href={claimHref(will.id)}
                      className="rounded-full bg-will-purple px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-will-purple/90"
                    >
                      View &amp; claim
                    </Link>
                  </li>
                );
              })}
            </ul>

            {currentPage.totalPages > 1 ? (
              <nav
                aria-label="Beneficiary lookup pages"
                className="mt-4 flex items-center justify-center gap-3 text-sm text-will-light/70"
              >
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage.page === 1}
                  className="rounded-full border border-white/20 px-3 py-1.5 transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {currentPage.page} of {currentPage.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(currentPage.totalPages, current + 1))}
                  disabled={currentPage.page === currentPage.totalPages}
                  className="rounded-full border border-white/20 px-3 py-1.5 transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
