import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

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

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale resolves from the locale the middleware determined (via
  // the NEXT_LOCALE cookie or Accept-Language) without re-entering this
  // config resolver — calling next-intl/server's getLocale() here instead
  // would recurse into getRequestConfig and blow the call stack.
  const candidate = await requestLocale;
  const locale =
    candidate && (supportedLocales as readonly string[]).includes(candidate)
      ? candidate
      : getLocaleFromAcceptLanguage((await headers()).get('accept-language') ?? undefined);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
