'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const preferenceKey = 'sorowill:skip-tutorial';

export function TutorialOptions({ children }: { children: ReactNode }) {
  const t = useTranslations('landing.tutorial');
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    function loadPreference() {
      try {
        setSkipped(location.hash !== '#full-tutorial' && localStorage.getItem(preferenceKey) === 'true');
      } catch {
        // The tutorial remains available if browser storage is disabled.
      }
    }
    loadPreference();
    window.addEventListener('hashchange', loadPreference);
    return () => window.removeEventListener('hashchange', loadPreference);
  }, []);

  function changePreference(skip: boolean) {
    if (skip && location.hash === '#full-tutorial') {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    setSkipped(skip);
    try {
      if (skip) localStorage.setItem(preferenceKey, 'true');
      else localStorage.removeItem(preferenceKey);
    } catch {
      // The selection still applies to the current page.
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        {skipped ? (
          <a href="#full-tutorial" className="underline" onClick={() => changePreference(false)}>
            {t('full')}
          </a>
        ) : (
          <button type="button" className="underline" onClick={() => changePreference(true)}>
            {t('skip')}
          </button>
        )}
      </div>
      <details id="quick-start" className="mx-auto max-w-xl rounded-xl border border-white/10 p-4 open:space-y-3">
        <summary className="cursor-pointer font-semibold">{t('quickStart')}</summary>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-will-light/80">
          <li>{t('connect')}</li>
          <li>{t('configure')}</li>
          <li>{t('checkIn')}</li>
        </ol>
        <Link href="/will/new" className="text-sm underline">{t('create')}</Link>
      </details>
      <div id="full-tutorial" className="scroll-mt-24" hidden={skipped}>{children}</div>
    </section>
  );
}
