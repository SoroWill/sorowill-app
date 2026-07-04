import { formatDeadline, WillStatus } from '@sorowill/sdk';

import { getContractId, getSoroWillClient, stellarExpertUrl } from '@/lib/sorowill';
import { StatusBanner } from '@/components/StatusBanner';

function truncate(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default async function VerifyPage({ params }: { params: { id: string } }) {
  const will = await getSoroWillClient().getWill(params.id);
  const nextDeadline = new Date(will.lastCheckin.getTime() + will.checkinPeriodDays * 86_400 * 1000);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Verify Will #{will.id}</h1>
        <p className="mt-1 text-sm text-will-light/60">
          A public, read-only view of this will&apos;s on-chain state, straight from the SoroWill contract. No
          wallet is required to view this page.
        </p>
      </div>

      <StatusBanner status={will.status} />

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">Beneficiaries</h2>
        <ul className="mt-2 space-y-1.5">
          {will.beneficiaries.map((beneficiary) => (
            <li key={beneficiary.address} className="flex justify-between text-sm">
              <span className="font-mono text-will-light/80">{truncate(beneficiary.address)}</span>
              <span className="text-will-light">{beneficiary.percentage}%</span>
            </li>
          ))}
        </ul>
      </div>

      {will.status === WillStatus.Active ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <span className="text-xs uppercase tracking-wide text-will-light/60">Next check-in deadline</span>
          <p className="mt-1 text-lg font-semibold text-will-light">{formatDeadline(nextDeadline)}</p>
        </div>
      ) : null}

      <a
        href={stellarExpertUrl('contract', getContractId())}
        target="_blank"
        rel="noreferrer"
        className="block rounded-full border border-white/20 px-4 py-3 text-center text-sm text-will-light/80 transition hover:border-white/40"
      >
        View SoroWill contract on Stellar Expert
      </a>
    </div>
  );
}
