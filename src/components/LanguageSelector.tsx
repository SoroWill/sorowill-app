'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type SupportedLocale = 'en' | 'es';

const localeLabels: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
};

/**
 * Language selector component that allows users to switch between supported locales.
 * Stores the user's preference in localStorage for persistence across sessions.
 */
export function LanguageSelector() {
  const locale = useLocale() as SupportedLocale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    if (newLocale === locale) return;

    startTransition(() => {
      // Store user's language preference
      localStorage.setItem('sorowill-locale', newLocale);

      // Reload the page to apply the new locale
      // Note: In a production app with [locale] route segments, you would route differently
      window.location.href = `/?locale=${newLocale}`;
    });
  };

  return (
    <div className="flex items-center gap-2">
      {(['en', 'es'] as const).map((loc) => (
        <button
          key={loc}
          onClick={() => handleLocaleChange(loc)}
          disabled={isPending}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            locale === loc
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label={`Switch to ${localeLabels[loc]}`}
          title={localeLabels[loc]}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
