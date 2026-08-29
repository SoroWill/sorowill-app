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
import { getContractId, getSoroWillClient, stellarExpertUrl } from '@/lib/sorowill';
import { nextCheckinDeadline } from '@/lib/deadlines';
import { StatusBanner } from '@/components/StatusBanner';
import { ShareVerification } from '@/components/ShareVerification';
import { CopyAddress } from '@/components/CopyAddress';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  let title = 'Verify Will';
  let description = 'A public, read-only view of this will\'s on-chain state.';
  const { id } = await params;

  try {
    const will = await getSoroWillClient().getWill(id);
    title = `Verify Will #${will.id}`;
    description = `Status: ${will.status}. Locked balance: ${(Number(will.balance) / 1_000_000).toFixed(2)} USDC. ${will.beneficiaries.length} beneficiaries.`;
  } catch {
    // Fall back to generic metadata if the will fetch fails.
  }

  return { title, description };
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let will;
  try {
    will = await getSoroWillClient().getWill(id);
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

      <StatusBanner status={will.status} />

      <div className="print-section rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light print-heading">Beneficiaries</h2>
        <ul className="mt-2 space-y-1.5">
          {will.beneficiaries.map((beneficiary) => (
            <li key={beneficiary.address} className="flex justify-between text-sm">
              <CopyAddress address={beneficiary.address} className="text-will-light/80" />
              <span className="text-will-light">{beneficiary.percentage}%</span>
            </li>
          ))}
        </ul>
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
