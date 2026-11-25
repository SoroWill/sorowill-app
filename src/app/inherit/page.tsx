'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { validateGuardians } from '@/lib/guardianValidation';
import { accountExists } from '@/lib/balance';

interface Guardian {
  address: string;
  name: string;
}

type AccountStatus = 'unknown' | 'checking' | 'exists' | 'not-funded' | 'error';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

export default function InheritPage() {
  const t = useTranslations('inherit');
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [newGuardianAddress, setNewGuardianAddress] = useState('');
  const [newGuardianName, setNewGuardianName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('unknown');
  const [checkingAccount, setCheckingAccount] = useState(false);

  useEffect(() => {
    const trimmed = newGuardianAddress.trim();
    if (!trimmed) {
      setAccountStatus('unknown');
      setValidationError(null);
      return;
    }

    const validation = validateGuardians([trimmed], null);
    const problem = validation.topError ?? validation.rowErrors[0];
    if (problem) {
      setValidationError(problem || t('invalidGuardianAddress'));
      setAccountStatus('unknown');
      return;
    }

    setValidationError(null);
    setAccountStatus('checking');
    setCheckingAccount(true);

    let cancelled = false;

    (async () => {
      try {
        const exists = await accountExists(trimmed);
        if (cancelled) return;
        if (exists === null) {
          setAccountStatus('error');
        } else if (exists) {
          setAccountStatus('exists');
        } else {
          setAccountStatus('not-funded');
        }
      } catch {
        if (!cancelled) setAccountStatus('error');
      } finally {
        if (!cancelled) setCheckingAccount(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [newGuardianAddress, t]);

  const canAddGuardian =
    newGuardianAddress.trim() !== '' &&
    !validationError &&
    !checkingAccount &&
    accountStatus !== 'not-funded' &&
    accountStatus !== 'error';

  const handleAddGuardian = () => {
    if (!canAddGuardian) return;
    setGuardians((prev) => [
      ...prev,
      { address: newGuardianAddress.trim(), name: newGuardianName.trim() },
    ]);
    setNewGuardianAddress('');
    setNewGuardianName('');
    setAccountStatus('unknown');
    setValidationError(null);
  };

  const handleRemoveGuardian = (index: number) => {
    setGuardians((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>

      <p className="mb-6 text-sm text-gray-600">
        Named as a beneficiary and not sure which wills you are in?{' '}
        <Link href="/inherit/lookup" className="font-medium text-blue-600 hover:underline">
          Look up wills by your address
        </Link>
        .
      </p>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">{t('guardiansTitle')}</h2>

        {guardians.length === 0 ? (
          <p className="mb-4 text-sm text-gray-500">{t('noGuardians')}</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {guardians.map((guardian, index) => (
              <li
                key={`${guardian.address}-${index}`}
                className="flex items-center justify-between rounded border border-gray-200 p-3"
              >
                <div>
                  <p className="font-medium">{guardian.name || t('unnamedGuardian')}</p>
                  <p className="break-all text-xs text-gray-500">{guardian.address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveGuardian(index)}
                  className="text-sm text-red-600 hover:underline"
                >
                  {t('remove')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded border border-gray-200 p-4">
          <div>
            <label htmlFor="guardian-name" className="mb-1 block text-sm font-medium">
              {t('guardianNameLabel')}
            </label>
            <input
              id="guardian-name"
              type="text"
              value={newGuardianName}
              onChange={(e) => setNewGuardianName(e.target.value)}
              placeholder={t('guardianNamePlaceholder')}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="guardian-address" className="mb-1 block text-sm font-medium">
              {t('guardianAddressLabel')}
            </label>
            <input
              id="guardian-address"
              type="text"
              value={newGuardianAddress}
              onChange={(e) => setNewGuardianAddress(e.target.value)}
              placeholder={t('guardianAddressPlaceholder')}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}

          {checkingAccount && (
            <p className="text-sm text-gray-500">{t('checkingAccount')}</p>
          )}

          {accountStatus === 'not-funded' && (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p className="mb-1 font-semibold">{t('guardianNotFundedTitle')}</p>
              <p className="mb-2">{t('guardianNotFundedDescription')}</p>
              <p className="mb-2">{t('guardianSetupInstructions')}</p>
              <a
                href={`${FRIENDBOT_URL}?addr=${encodeURIComponent(newGuardianAddress.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                {t('fundWithFriendbot')}
              </a>
            </div>
          )}

          {accountStatus === 'error' && (
            <div className="rounded border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
              <p className="mb-1 font-semibold">{t('accountCheckFailedTitle')}</p>
              <p>{t('accountCheckFailedDescription')}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleAddGuardian}
            disabled={!canAddGuardian}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('addGuardian')}
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <Link
          href="/inherit/confirm"
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t('continue')}
        </Link>
      </div>
    </div>
  );
}