import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getLocale } from 'next-intl/server';

/**
 * Supported locales for the application
 */
const supportedLocales = ['en', 'es'] as const;
type SupportedLocale = (typeof supportedLocales)[number];

/**
 * Parse Accept-Language header to determine the best locale for the user.
 * Falls back to English if no supported locale matches.
 */
function getLocaleFromAcceptLanguage(acceptLanguageHeader?: string): SupportedLocale {
  if (!acceptLanguageHeader) return 'en';

  // Parse the Accept-Language header to get preferred locales
  const preferredLocales = acceptLanguageHeader
    .split(',')
    .map((part) => {
      const [locale, q = 'q=1'] = part.trim().split(';');
      const quality = parseFloat(q.replace('q=', ''));
      return { locale: locale.split('-')[0].toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality)
    .map(({ locale }) => locale);

  // Find the first preferred locale that we support
  for (const locale of preferredLocales) {
    if ((supportedLocales as readonly string[]).includes(locale)) {
      return locale as SupportedLocale;
    }
  }

  return 'en';
}

export default getRequestConfig(async () => {
  // Try to get locale from next-intl first (set by middleware)
  try {
    const locale = await getLocale();
    if ((supportedLocales as readonly string[]).includes(locale)) {
      return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default,
      };
    }
  } catch {
    // If getLocale fails, fall through to Accept-Language detection
  }

  // Fall back to parsing the raw Accept-Language header (defaults to 'en'
  // if the header is missing or matches no supported locale).
  const acceptLanguage = (await headers()).get('accept-language') ?? undefined;
  const locale = getLocaleFromAcceptLanguage(acceptLanguage);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
