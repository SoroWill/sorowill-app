// Force every request to hit the Soroban RPC directly and skip Next.js's
// default fetch cache. This page's entire purpose is to display trustworthy,
// up-to-the-request on-chain truth (will status, balance, beneficiaries).
// Serving a cached snapshot — even one only seconds old — could mislead
// visitors who share the URL immediately after a status change on-chain
// (e.g. a will just got triggered or released). 'force-dynamic' is the
// correct choice here over a short `revalidate` window because the on-chain
// state can change in a single block (~5 s on Stellar), and the verify page
// is explicitly marketed as a wallet-free source of truth.
export const dynamic = 'force-dynamic';

import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { formatDeadline, WillStatus } from '@sorowill/sdk';
import { getContractId, stellarExpertUrl } from '@/lib/sorowill';
import { isValidWillId } from '@/lib/willId';
import { getCachedWill, buildWillMetadataDescription } from '@/lib/willMetadata';
import { isWillNotFoundError } from '@/lib/errors';
import { nextCheckinDeadline } from '@/lib/deadlines';
import { StatusBanner } from '@/components/StatusBanner';
import { ShareVerification } from '@/components/ShareVerification';
import { CopyAddress } from '@/components/CopyAddress';
import { SignatureExpiryNotice } from '@/components/SignatureExpiryNotice';
import { getSignatureExpiryStatus, parseSignatureInfo } from '@/lib/signatureExpiry';
import { openShareToken, recordShareAccess } from '@/lib/shareLinks';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  let title = 'Verify Will';
  let description = 'A public, read-only view of this will\'s on-chain state.';
  const { id } = await params;
  if (!isValidWillId(id)) {
    return { title, description };
  }

  try {
    const will = await getCachedWill(id);
    title = `Verify Will #${will.id}`;
    description = buildWillMetadataDescription(will);
  } catch {
    // Fall back to generic metadata if the will fetch fails.
  }

  return { title, description };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ signedAt?: string | string[]; expires?: string | string[]; share?: string | string[] }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const signature = parseSignatureInfo(query);
  if (!isValidWillId(id)) {
    notFound();
  }

  // #875: a time-limited share link is refused once expired or tampered with;
  // a valid one is counted for the creator's access stats.
  const shareToken = Array.isArray(query.share) ? query.share[0] : query.share;
  const share = shareToken ? openShareToken(shareToken, id) : null;
  if (share && !share.ok) {
    return (
      <div className="mx-auto max-w-xl space-y-4" data-testid="share-link-refused">
        <h1 className="text-2xl font-bold text-will-light">Verify Will #{id}</h1>
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">
          {share.reason === 'expired'
            ? 'This share link has expired. Ask the person who shared it for a new link.'
            : 'This share link is not valid.'}
        </p>
      </div>
    );
  }
  if (share?.ok) recordShareAccess(share.linkId);

  let will;
  try {
    will = await getCachedWill(id);
  } catch (error) {
    if (isWillNotFoundError(error)) {
      notFound();
    }
    // Any other error (network timeout, RPC outage, …) re-throws so the
    // route-level error.tsx boundary can display it with a "Try again" button.
    throw error;
  }

  const nextDeadline = nextCheckinDeadline(will);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="print-section">
        <h1 className="text-2xl font-bold text-will-light print-title">Verify Will #{will.id}</h1>
        <p className="print-hide mt-1 text-sm text-will-light/60">
          A public, read-only view of this will&apos;s on-chain state, straight from the SoroWill contract. No
          wallet is required to view this page.
        </p>
      </div>

      {share?.ok ? (
        <p className="print-hide rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-will-light/70" data-testid="share-link-notice">
          Shared link, valid until {new Date(share.expiresAt).toUTCString()}.
        </p>
      ) : null}

      {signature ? <SignatureExpiryNotice status={getSignatureExpiryStatus(signature)} willId={will.id} /> : null}

      <StatusBanner status={will.status} />

      <div className="print-section rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light print-heading">Beneficiaries</h2>
        <BeneficiaryRows
          rows={will.beneficiaries.map((beneficiary) => ({
            address: beneficiary.address,
            value: `${beneficiary.percentage}%`,
          }))}
        />
      </div>

      {will.status === WillStatus.Active ? (
        <div className="print-section rounded-xl border border-white/10 bg-white/5 p-4">
          <span className="text-xs uppercase tracking-wide text-will-light/60 print-text">Next check-in deadline</span>
          <p className="mt-1 text-lg font-semibold text-will-light print-text">{formatDeadline(nextDeadline)}</p>
        </div>
      ) : null}

      <div className="print-hide">
        <ShareVerification />
      </div>

      <a
        href={stellarExpertUrl('contract', getContractId())}
        target="_blank"
        rel="noreferrer"
        className="print-hide block rounded-full border border-white/20 px-4 py-3 text-center text-sm text-will-light/80 transition hover:border-white/40"
      >
        View SoroWill contract on Stellar Expert
      </a>
    </div>
  );
}
