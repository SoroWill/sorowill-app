import Link from 'next/link';
import { useTranslations } from 'next-intl';

const FAQs = [
  {
    question: 'How does SoroWill work?',
    answer:
      'SoroWill is a smart contract on Stellar Soroban that automates inheritance. You lock USDC into the contract, specify beneficiaries and check-in periods, and prove you are still active by checking in before each deadline. If you miss a check-in, anyone can trigger the grace period. If the grace period passes without a response from you, the contract automatically distributes your funds to your beneficiaries according to the percentages you set.',
  },
  {
    question: 'What happens if I miss a check-in?',
    answer:
      'If you miss a check-in deadline, anyone can trigger a grace period (which you set during creation, typically 3-14 days). During this grace period, you can still respond and prevent the release. You simply need to access SoroWill and check in again. If you do not respond before the grace period ends, the funds are released to your beneficiaries automatically.',
  },
  {
    question: 'Can I update my beneficiaries after creating a will?',
    answer:
      'Yes. While active, the will details page lets you update beneficiary addresses and percentage splits in place. Check-in and grace periods are set when the will is created.',
  },
  {
    question: 'Can I cancel my will?',
    answer:
      'Yes, at any time while you remain active (before the grace period is triggered), you can cancel your will and recover your funds. This is done through the will details page. Once a grace period is triggered, cancellation is no longer possible.',
  },
  {
    question: 'What are guardians and what can they do?',
    answer:
      'Guardians are optional trusted addresses (up to 3) that you can designate. Any 2 guardians can force an early release of your will if you become incapacitated. This is an additional safeguard to ensure funds reach your beneficiaries if you cannot respond.',
  },
  {
    question: 'Can I recover my funds if I trigger a grace period?',
    answer:
      'Yes, during the grace period (which you set when creating your will), you can still check in and prevent the release. Once the grace period expires without a check-in, the funds are released permanently and cannot be recovered.',
  },
  {
    question: 'What tokens does SoroWill support?',
    answer:
      'A will accepts a token contract address, so it is not limited to USDC. Select a compatible token on the configured Stellar network.',
  },
  {
    question: 'Is SoroWill trustless?',
    answer:
      'Yes. SoroWill is trustless because it is governed entirely by the smart contract. No lawyers, courts, or intermediaries are involved. The contract enforces the outcome exactly as you configured it. All logic is on-chain and transparent.',
  },
  {
    question: 'Can I see other wills or access someone else\'s will?',
    answer:
      'The public verification page can show a will without a wallet. Actions and beneficiary-specific views still require the appropriate connected wallet.',
  },
  {
    question: 'What happens if I lose access to my wallet?',
    answer:
      'If you lose access to your wallet and cannot check in, the grace period will eventually expire and your beneficiaries will receive the funds. If you designated guardians, any 2 of them can trigger an early release. SoroWill is designed to ensure funds reach your beneficiaries even if you cannot respond.',
  },
  {
    question: 'Can beneficiaries check their inheritance status?',
    answer:
      'Yes. The public verification page shows beneficiaries, percentage splits, and the next deadline. It does not disclose the locked amount; claiming happens from the inheritance page after release.',
  },
  {
    question: 'How do I know my will is safe?',
    answer:
      'All wills are stored on the Stellar blockchain and secured by the SoroWill smart contract. Your private keys remain under your control. Only the will data is on-chain; your beneficiary addresses and settings are transparent but not reversible once submitted.',
  },
  {
    question: 'Can I use federated addresses?',
    answer:
      'Yes. SoroWill supports Stellar federated addresses in the format name*domain.com for beneficiaries and guardians. Simply enter the federated address and use the Resolve button to convert it to the underlying Stellar address for confirmation.',
  },
  {
    question: 'What if I forget my check-in deadline?',
    answer:
      'You set your own check-in period when creating a will (30, 60, 90, 180, or 365 days). We recommend setting calendar reminders for yourself. The will details page always shows your next check-in deadline.',
  },
  {
    question: 'Are there any fees?',
    answer:
      'SoroWill does not take a percentage of your funds. You only pay standard Stellar network fees for transactions (check-in, creation, claim, etc.). These fees are typically very small.',
  },
  {
    question: 'How do I claim my inheritance?',
    answer:
      'If you are a beneficiary of a will that has been released, you can claim your share through the inheritance page. You will need your Stellar wallet connected and must complete a simple transaction to receive your funds.',
  },
];

export default function FAQPage() {
  const t = useTranslations('faq');
  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-8 sm:py-16 sm:px-0">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-will-light sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-lg text-will-light/70">{t('subtitle')}</p>
      </section>

      <section className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-will-light">{t('lifecycle.heading')}</h2>
          <p className="text-sm text-will-light/60">{t('lifecycle.description')}</p>
        </div>

        <div className="space-y-6">
          <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <span className="font-mono text-sm font-semibold text-will-purple">01</span>
            <div>
              <h3 className="font-semibold text-will-light">Create a Will</h3>
              <p className="mt-1 text-sm text-will-light/60">
                Connect your wallet, deposit USDC, specify beneficiaries with percentage splits,
                set check-in and grace periods, and optionally add guardians. Your will is now
                active and locked on-chain.
              </p>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <span className="font-mono text-sm font-semibold text-will-purple">02</span>
            <div>
              <h3 className="font-semibold text-will-light">Regular Check-ins</h3>
              <p className="mt-1 text-sm text-will-light/60">
                Before each check-in deadline (30, 60, 90, 180, or 365 days), you must prove you
                are still active by clicking the check-in button. This resets the deadline. You
                can update beneficiaries or settings at any time while active.
              </p>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <span className="font-mono text-sm font-semibold text-will-purple">03</span>
            <div>
              <h3 className="font-semibold text-will-light">Miss a Check-in</h3>
              <p className="mt-1 text-sm text-will-light/60">
                If you do not check in by the deadline, anyone can trigger the grace period. No
                automatic beneficiary notification is sent. You still have time to respond—just check in and the
                will remains active.
              </p>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <span className="font-mono text-sm font-semibold text-will-purple">04</span>
            <div>
              <h3 className="font-semibold text-will-light">Grace Period</h3>
              <p className="mt-1 text-sm text-will-light/60">
                A grace period (3, 7, or 14 days) begins after a missed check-in. If you check in during this
                time, your will remains active and no funds are released. If you do not respond, the grace
                period expires and funds are released to beneficiaries.
              </p>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <span className="font-mono text-sm font-semibold text-will-purple">05</span>
            <div>
              <h3 className="font-semibold text-will-light">Funds Released</h3>
              <p className="mt-1 text-sm text-will-light/60">
                Once the grace period expires, the contract automatically distributes your USDC to your
                beneficiaries according to the percentages you set. Beneficiaries can then claim their
                share through the inheritance page.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-will-light">{t('faqHeading')}</h2>

        <div className="space-y-4">
          {FAQs.map((faq, index) => {
            const translatedQuestion = t(`items.${index}.question`);
            const translatedAnswer = t(`items.${index}.answer`);
            return (
            <details
              key={translatedQuestion}
              className="rounded-xl border border-white/10 bg-white/5 p-6 transition-all [&[open]]:bg-white/10"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-will-light hover:text-white">
                <span>{translatedQuestion}</span>
                <span className="ml-2 text-will-purple">{/* + */}▸</span>
              </summary>
              <p className="mt-4 text-sm text-will-light/70">{translatedAnswer}</p>
            </details>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-will-light">{t('cta.title')}</h2>
        <p className="mt-2 text-sm text-will-light/60">{t('cta.description')}</p>
        <Link
          href="/will/new"
          className="mt-4 inline-block rounded-full bg-will-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90"
        >
          {t('cta.button')}
        </Link>
      </section>
    </div>
  );
}
