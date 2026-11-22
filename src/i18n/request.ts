import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { getLocaleFromAcceptLanguage, supportedLocales } from './negotiate';

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale resolves from the locale the middleware determined (via
  // the NEXT_LOCALE cookie or Accept-Language) without re-entering this
  // config resolver — calling next-intl/server's getLocale() here instead
  // would recurse into getRequestConfig and blow the call stack.
  //
  // The app has no middleware, so requestLocale is usually empty. The NEXT_LOCALE cookie
  // written by the language selector is read here, otherwise the choice would be lost on
  // reload (#819).
  const supported = (value: string | undefined): value is (typeof supportedLocales)[number] =>
    value !== undefined && (supportedLocales as readonly string[]).includes(value);
  const candidate = await requestLocale;
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
  const locale = supported(candidate)
    ? candidate
    : supported(cookieLocale)
      ? cookieLocale
      : getLocaleFromAcceptLanguage((await headers()).get('accept-language') ?? undefined);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
