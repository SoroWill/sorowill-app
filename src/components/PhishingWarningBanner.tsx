'use client';

import { useEffect, useState } from 'react';

import { verifyDomain, type DomainVerification } from '@/lib/antiPhishing';

/**
 * Warns the visitor when the app is not served from the official SoroWill domain (#909).
 * Renders nothing on the verified domain and nothing until the origin is known on the client.
 */
export function PhishingWarningBanner() {
  const [verification, setVerification] = useState<DomainVerification | null>(null);

  useEffect(() => {
    setVerification(verifyDomain());
  }, []);

  if (!verification || verification.status === 'verified') return null;

  const suspicious = verification.status === 'suspicious';

  return (
    <div
      role="alert"
      data-testid="phishing-warning"
      data-status={verification.status}
      className={
        suspicious
          ? 'border-b border-red-500/40 bg-red-500/15 px-4 py-2 text-center text-xs text-red-200'
          : 'border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300'
      }
    >
      <strong className="font-semibold">
        {suspicious ? 'Warning: suspicious site.' : 'Warning: unverified site.'}
      </strong>{' '}
      {verification.reason} The official site is{' '}
      <span className="font-mono">sorowill.org</span>. Never share your secret key.
    </div>
  );
}
