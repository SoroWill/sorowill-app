'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

import { supportedLocales, type SupportedLocale } from '@/i18n/negotiate';

const DEFAULT_LOCALE: SupportedLocale = 'en';
const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_STORAGE_KEY = 'sorowill_locale';

function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLocale(locale: SupportedLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be blocked; the cookie still remembers the choice.
  }
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (supportedLocales as readonly string[]).includes(value);
}

function writeLocaleCookie(locale: SupportedLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000`;
}

function readLocaleCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const localeLabels: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
};

function persistLocale(locale: SupportedLocale) {
  writeLocaleCookie(locale);
  storeLocale(locale);
}

/**
 * Language selector component that allows users to switch between supported
 * locales. Persists the choice in the `NEXT_LOCALE` cookie -- the convention
 * the server reads -- then reloads the document so the server renders the
 * page and its locale together before hydration.
 */
export function LanguageSelector() {
  const locale = useLocale() as SupportedLocale;

  useEffect(() => {
    const persisted = readLocaleCookie();
    if (persisted !== undefined && !isSupportedLocale(persisted)) {
      writeLocaleCookie(DEFAULT_LOCALE);
    }
    const stored = readStoredLocale();
    if (isSupportedLocale(persisted)) {
      // Keep localStorage in step with the cookie the server reads.
      if (stored !== persisted) storeLocale(persisted);
    } else if (isSupportedLocale(stored) && stored !== locale) {
      // The cookie is gone (cleared or expired) but the choice was saved: restore it and
      // apply it now, so the page the server rendered is replaced by the saved language.
      writeLocaleCookie(stored);
      // Only reload when the cookie stuck, so blocked cookies cannot cause a reload loop.
      if (readLocaleCookie() === stored) window.location.reload();
    }
  }, [locale]);

  const handleLocaleChange = (newLocale: string) => {
    if (!isSupportedLocale(newLocale) || newLocale === locale) return;

    persistLocale(newLocale);
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2">
      {supportedLocales.map((loc) => (
        <button
          key={loc}
          onClick={() => handleLocaleChange(loc)}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            locale === loc
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
          aria-label={`Switch to ${localeLabels[loc]}`}
          title={localeLabels[loc]}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
