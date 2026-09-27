import Link from 'next/link';
import { useTranslations } from 'next-intl';

// Issue #442: the FAQ copy used to be a hardcoded English array in this file, so
// visitors reading the app in Spanish got English questions while every other
// page was translated. The content now lives in the `faq` namespace of
// src/messages/{en,es}.json and is rendered through next-intl, and
// `npm run check:messages` (wired into `prebuild`) fails the production build
// when the two locales fall out of sync.

interface LifecycleStep {
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

export default function FAQPage() {
  const t = useTranslations('faq');
  // `t.raw` keeps the arrays as-is: neither the FAQ list nor the lifecycle steps
  // contain placeholders, so they only need iteration, not ICU compilation.
  const steps = t.raw('steps') as LifecycleStep[];
  const items = t.raw('items') as FaqItem[];

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
          <h2 className="text-2xl font-bold text-will-light">{t('lifecycleTitle')}</h2>
          <p className="text-sm text-will-light/60">{t('lifecycleIntro')}</p>
        </div>

        <div className="space-y-6">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6"
            >
              <span className="font-mono text-sm font-semibold text-will-purple">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-semibold text-will-light">{step.title}</h3>
                <p className="mt-1 text-sm text-will-light/60">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-will-light">{t('itemsTitle')}</h2>

        <div className="space-y-4">
          {items.map((faq) => (
            <details
              key={faq.question}
              className="rounded-xl border border-white/10 bg-white/5 p-6 transition-all [&[open]]:bg-white/10"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-will-light hover:text-white">
                <span>{faq.question}</span>
                <span className="ml-2 text-will-purple">{/* + */}▸</span>
              </summary>
              <p className="mt-4 text-sm text-will-light/70">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-will-light">{t('ctaTitle')}</h2>
        <p className="mt-2 text-sm text-will-light/60">{t('ctaDescription')}</p>
        <Link
          href="/will/new"
          className="mt-4 inline-block rounded-full bg-will-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90"
        >
          {t('ctaButton')}
        </Link>
      </section>
    </div>
  );
}
