'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { getUserBalance } from '@/lib/balance';
import { useWallet } from '@/lib/wallet';

const VERIFICATION_FEE = '0.5';

export default function VerifyPage() {
  const { t } = useTranslation();
  const { address, network } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requiredAmount = VERIFICATION_FEE;

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
        if (!cancelled) {
          setBalance(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('verify.balanceError')
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBalance();

    return () => {
      cancelled = true;
    };
  }, [address, t]);

  const numericBalance = balance !== null ? parseFloat(balance) : NaN;
  const numericRequired = parseFloat(requiredAmount);
  const isLowBalance =
    balance !== null &&
    !Number.isNaN(numericBalance) &&
    numericBalance < numericRequired;

  const isTestnet = network === 'testnet' || network === 'futurenet';
  const fundLink = isTestnet
    ? `https://friendbot.stellar.org/?addr=${encodeURIComponent(address ?? '')}`
    : 'https://stellar.org/learn/fund-your-account';

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('verify.title')}</h1>

      <div className="mb-6 rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold mb-3">
          {t('verify.balance.title')}
        </h2>

        {!address && (
          <p className="text-gray-600">{t('verify.balance.connectWallet')}</p>
        )}

        {address && loading && (
          <p className="text-gray-600">{t('verify.balance.loading')}</p>
        )}

        {address && !loading && error && (
          <p className="text-red-600">
            {t('verify.balance.error', { message: error })}
          </p>
        )}

        {address && !loading && !error && balance !== null && (
          <div className="space-y-2">
            <p className="text-gray-800">
              {t('verify.balance.current')}:{' '}
              <span className="font-semibold">{balance} USDC</span>
            </p>
            <p className="text-gray-800">
              {t('verify.balance.required')}:{' '}
              <span className="font-semibold">{requiredAmount} USDC</span>
            </p>

            {isLowBalance && (
              <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3">
                <p className="text-yellow-800 font-medium">
                  {t('verify.balance.lowWarning')}
                </p>
                <Link
                  href={fundLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-blue-600 underline"
                >
                  {isTestnet
                    ? t('verify.balance.fundTestnet')
                    : t('verify.balance.fundMainnet')}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold mb-3">
          {t('verify.signature.title')}
        </h2>
        <p className="text-gray-600">{t('verify.signature.description')}</p>
      </div>
    </div>
  );
}