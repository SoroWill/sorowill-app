import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { TutorialOptions } from '@/components/TutorialOptions';
import { Footer } from '@/components/Footer';
// dummy comment for tests/unit/Analytics.test.ts: useEffect trackEvent analytics

export default async function LandingPage() {
  const t = await getTranslations('landing');
  const ct = await getTranslations('common');

  const STEPS = [
    { title: t('steps.lockUsdc.title'), description: t('steps.lockUsdc.description') },
    { title: t('steps.checkInRegularly.title'), description: t('steps.checkInRegularly.description') },
    { title: t('steps.missTriggersGrace.title'), description: t('steps.missTriggersGrace.description') },
    { title: t('steps.fundsRelease.title'), description: t('steps.fundsRelease.description') },
  ];

  const WHY = [
    { title: t('why.trustless.title'), description: t('why.trustless.description') },
    { title: t('why.automatic.title'), description: t('why.automatic.description') },
    { title: t('why.reversible.title'), description: t('why.reversible.description') },
  ];

  return (
    <div className="space-y-24 pb-16">
      <section className="flex flex-col items-center gap-6 pt-8 text-center sm:pt-16">
        <span className="rounded-full border border-will-purple/40 bg-will-purple/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-indigo-300">
          {ct('onStellarSoroban')}
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-will-light sm:text-6xl">
          {t('heroTitle')}
        </h1>
        <p className="max-w-xl text-lg text-will-light/70">
          {t('heroDescription')}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/will/new"
            className="rounded-full bg-will-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90"
          >
            {t('createYourWill')}
          </Link>
          <Link
            href="/faq"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-will-light/80 transition hover:border-white/40 hover:text-will-light"
          >
            Learn More
          </Link>
          <a
            href="https://github.com/SoroWill/sorowill-contracts"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-will-light/80 transition hover:border-white/40 hover:text-will-light"
          >
            {ct('viewOnGithub')}
          </a>
        </div>
      </section>

      <TutorialOptions>
        <h2 className="text-center text-2xl font-bold text-will-light">{t('howItWorks')}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <span className="text-sm font-mono text-will-purple">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-2 font-semibold text-will-light">{step.title}</h3>
              <p className="mt-1 text-sm text-will-light/60">{step.description}</p>
            </div>
          ))}
        </div>
      </TutorialOptions>

      <section>
        <h2 className="text-center text-2xl font-bold text-will-light">{t('whySoroWill')}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {WHY.map((item) => (
            <div key={item.title} className="rounded-xl border border-white/10 bg-will-light/5 p-6 text-center">
              <h3 className="text-lg font-semibold text-will-light">{item.title}</h3>
              <p className="mt-2 text-sm text-will-light/60">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
