'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { getUserBalance } from '@/lib/balance';
import { safeGetPublicKey } from '@/lib/freighter';
import { getNetwork } from '@/lib/sorowill';

/** Displayed fee a verification transaction is expected to cost, in USDC. */
const VERIFICATION_FEE = '0.5';

/**
 * Wallet readiness check before verifying a will signature: shows the
 * connected account's balance against the expected fee and links to a faucet
 * on testnet when the account cannot pay for the transaction.
 */
export default function VerifyClient() {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string>('testnet');
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNetwork(getNetwork());
    void safeGetPublicKey().then(setAddress);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBalance() {
      if (!address) {
        setBalance(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await getUserBalance(address);
        if (!cancelled) setBalance(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your balance.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const numericBalance = balance !== null ? Number.parseFloat(balance) : Number.NaN;
  const numericRequired = Number.parseFloat(VERIFICATION_FEE);
  const isLowBalance =
    balance !== null && !Number.isNaN(numericBalance) && numericBalance < numericRequired;

  const isTestnet = network === 'testnet' || network === 'futurenet';
  const fundLink = isTestnet
    ? `https://friendbot.stellar.org/?addr=${encodeURIComponent(address ?? '')}`
    : 'https://stellar.org/learn/fund-your-account';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-will-light">Verify a will signature</h1>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-will-light">Wallet balance</h2>

        {!address ? (
          <p className="mt-2 text-sm text-will-light/60">Connect your wallet to check its balance.</p>
        ) : null}
        {address && loading ? (
          <p className="mt-2 text-sm text-will-light/60">Loading your balance…</p>
        ) : null}
        {address && !loading && error ? (
          <p className="mt-2 text-sm text-red-400">Could not load your balance: {error}</p>
        ) : null}

        {address && !loading && !error && balance !== null ? (
          <div className="mt-2 space-y-2 text-sm text-will-light/80">
            <p>
              Current balance: <span className="font-semibold text-will-light">{balance} USDC</span>
            </p>
            <p>
              Required for verification:{' '}
              <span className="font-semibold text-will-light">{VERIFICATION_FEE} USDC</span>
            </p>

            {isLowBalance ? (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-amber-200">
                <p className="font-medium">Your balance is below the verification fee.</p>
                <Link
                  href={fundLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block underline"
                >
                  {isTestnet ? 'Fund your testnet account' : 'Learn how to fund your account'}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-will-light">Signature verification</h2>
        <p className="mt-2 text-sm text-will-light/60">
          Open a will&apos;s verification page to check its signature and on-chain state without
          connecting a wallet.
        </p>
        <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light/70">
          Verification pages are read-only and never ask for a signature.
        </p>
      </section>
    </div>
  );
}
