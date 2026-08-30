import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localePrefix: 'never', // Don't require /en or /es in URL; use Accept-Language header instead
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
