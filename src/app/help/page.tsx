import Link from 'next/link';
import { useTranslations } from 'next-intl';

const TOPIC_KEYS = ['gettingStarted', 'wallets', 'checkIns', 'beneficiaries'] as const;

const TOPIC_LINKS: Record<(typeof TOPIC_KEYS)[number], string> = {
  gettingStarted: '/learn',
  wallets: '/faq',
  checkIns: '/faq',
  beneficiaries: '/faq',
};

export default function HelpPage() {
  const t = useTranslations('help');

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-8 sm:py-16 sm:px-0">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-will-light sm:text-4xl">{t('title')}</h1>
        <p className="text-lg text-will-light/70">{t('subtitle')}</p>
      </section>

      <section aria-labelledby="topics-heading" className="space-y-4">
        <h2 id="topics-heading" className="text-2xl font-bold text-will-light">{t('topics.heading')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TOPIC_KEYS.map((key) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="font-semibold text-will-light">{t(`topics.items.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-will-light/60">{t(`topics.items.${key}.description`)}</p>
              <Link href={TOPIC_LINKS[key]} className="mt-3 inline-block text-sm underline">
                {t(`topics.items.${key}.link`)}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-will-light">{t('contact.heading')}</h2>
        <p className="mt-2 text-sm text-will-light/60">{t('contact.description')}</p>
        <Link
          href="/contact"
          className="mt-4 inline-block rounded-full bg-will-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90"
        >
          {t('contact.button')}
        </Link>
      </section>
    </div>
  );
}
