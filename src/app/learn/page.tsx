import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { InteractiveTutorial } from '@/components/InteractiveTutorial';

const VIDEO_KEYS = ['overview', 'create', 'claim'] as const;
const GLOSSARY_KEYS = [
  'will',
  'beneficiary',
  'basisPoints',
  'checkIn',
  'gracePeriod',
  'guardian',
  'federatedAddress',
  'usdc',
  'soroban',
] as const;

export default function LearnPage() {
  const t = useTranslations('learn');

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-8 sm:py-16 sm:px-0">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-will-light sm:text-4xl">{t('title')}</h1>
        <p className="text-lg text-will-light/70">{t('subtitle')}</p>
      </section>

      <InteractiveTutorial />

      <section aria-labelledby="videos-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="videos-heading" className="text-2xl font-bold text-will-light">{t('videos.heading')}</h2>
          <p className="text-sm text-will-light/60">{t('videos.description')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {VIDEO_KEYS.map((key) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="font-semibold text-will-light">{t(`videos.items.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-will-light/60">{t(`videos.items.${key}.description`)}</p>
              <a
                href="https://www.youtube.com/@sorowill"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm underline"
              >
                {t('videos.watch')}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="glossary-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="glossary-heading" className="text-2xl font-bold text-will-light">{t('glossary.heading')}</h2>
          <p className="text-sm text-will-light/60">{t('glossary.description')}</p>
        </div>
        <dl className="space-y-3">
          {GLOSSARY_KEYS.map((key) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <dt className="font-semibold text-will-light">{t(`glossary.terms.${key}.term`)}</dt>
              <dd className="mt-1 text-sm text-will-light/70">{t(`glossary.terms.${key}.definition`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-will-light">{t('help.title')}</h2>
        <p className="mt-2 text-sm text-will-light/60">{t('help.subtitle')}</p>
        <Link
          href="/help"
          className="mt-4 inline-block rounded-full bg-will-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90"
        >
          {t('help.title')}
        </Link>
      </section>
    </div>
  );
}
