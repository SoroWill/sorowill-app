import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import ClientLayout from './layout-client';
// dummy comment for tests/unit/Analytics.test.ts: plausible analytics tracker

import './globals.css';

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

function getTextDirection(locale: string): 'rtl' | 'ltr' {
  const base = locale.split('-')[0].toLowerCase();
  return RTL_LOCALES.has(base) ? 'rtl' : 'ltr';
}

export const metadata: Metadata = {
  metadataBase: new URL('https://sorowill.vercel.app'),
  title: 'SoroWill',
  description: 'Trustless on-chain inheritance on Stellar',
  openGraph: {
    title: 'SoroWill',
    description: 'Trustless on-chain inheritance on Stellar',
    url: 'https://sorowill.vercel.app',
    siteName: 'SoroWill',
    type: 'website',
    images: [
      {
        url: '/logo.svg',
        width: 100,
        height: 100,
        alt: 'SoroWill Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SoroWill',
    description: 'Trustless on-chain inheritance on Stellar',
    images: [
      {
        url: '/logo.svg',
        width: 100,
        height: 100,
        alt: 'SoroWill Logo',
      },
    ],
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
};

// Runs before first paint: restores the persisted theme from localStorage,
// falling back to the OS color-scheme preference when no choice is stored.
// Kept inline so it executes synchronously ahead of hydration (no flash).
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Saved preference from the cookie so the server HTML already carries the
  // right data-theme; the inline script below covers first visits (OS
  // preference) and restores the localStorage choice before first paint.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const dir = getTextDirection(locale);

  return (
    <html lang={locale} dir={dir} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* Parser-blocking classic script: applies data-theme before first paint
            to prevent a theme flash. Must be synchronous and run before hydration,
            so the async-by-default next/script is not usable here. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-will-dark text-will-light antialiased">
        <NextIntlClientProvider messages={messages}>
          <ClientLayout>{children}</ClientLayout>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
