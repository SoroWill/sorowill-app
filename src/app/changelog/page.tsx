import { Metadata } from 'next';
import { ChangelogList } from '@/components/ChangelogList';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Changelog | SoroWill',
  description: 'SoroWill protocol updates and release notes',
};

const CHANGELOG_ENTRIES = [
  {
    version: 'v0.1.0',
    date: 'July 2026',
    title: 'Launch',
    highlights: [
      'Initial release of SoroWill on Stellar Soroban',
      'Core features: create wills, set beneficiaries, check-in mechanism',
      'Public stats page for protocol transparency',
      'Non-custodial smart contracts with immutable deployment',
      'Legal pages and privacy policy',
      'Open source under MIT license',
    ],
  },
  {
    version: 'v0.9.0',
    date: 'June 2026',
    title: 'Release Candidate',
    highlights: [
      'Dashboard for will management',
      'Verification flow for beneficiaries',
      'Guardian onboarding process',
      'Inheritance trigger mechanisms',
      'Contract integration testing',
    ],
  },
  {
    version: 'v0.5.0',
    date: 'April 2026',
    title: 'Testnet Alpha',
    highlights: [
      'Initial smart contract deployment on Soroban testnet',
      'Web interface prototype',
      'Wallet integration (Freighter)',
      'Basic check-in functionality',
      'Beneficiary configuration',
    ],
  },
];

const ROADMAP_ITEMS = [
  'Email reminders and push notifications',
  'Multi-signature support for guardianship',
  'Recovery key management and export',
  'Advanced analytics and activity dashboard',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChangelogPage() {
  return (
    <div className="space-y-8 pb-16">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-will-light">Changelog</h1>
        <p className="text-will-light/60">
          Protocol updates, new features, and improvements to SoroWill.
        </p>
      </section>

      <ChangelogList entries={CHANGELOG_ENTRIES} />

      <section className="rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold text-will-light">Future Roadmap</h3>
        <ul className="mt-4 space-y-2 text-will-light/80">
          {ROADMAP_ITEMS.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="shrink-0 text-will-purple">◊</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <Footer />
    </div>
  );
}
