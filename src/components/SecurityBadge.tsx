'use client';

import { useEffect, useState } from 'react';

import { verifyDomain, type DomainVerification } from '@/lib/antiPhishing';

const STYLES: Record<DomainVerification['status'], string> = {
  verified: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  unverified: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  suspicious: 'border-red-500/30 bg-red-500/10 text-red-300',
};

const LABELS: Record<DomainVerification['status'], string> = {
  verified: 'Verified domain',
  unverified: 'Unverified domain',
  suspicious: 'Suspicious domain',
};

/**
 * Security badge showing whether the current domain is the official SoroWill domain (#909).
 * Renders nothing until the client knows the origin so server and client markup match.
 */
export function SecurityBadge() {
  const [verification, setVerification] = useState<DomainVerification | null>(null);

  useEffect(() => {
    setVerification(verifyDomain());
  }, []);

  if (!verification) return null;

  return (
    <span
      role="status"
      data-testid="security-badge"
      data-status={verification.status}
      title={verification.reason}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[verification.status]}`}
    >
      <span aria-hidden="true">{verification.status === 'verified' ? '✓' : '!'}</span>
      {LABELS[verification.status]}
    </span>
  );
}
