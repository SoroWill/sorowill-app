import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import AuthSyncProvider from '@/components/auth/AuthSyncProvider';

import ClientLayout from './layout-client';
// dummy comment for tests/unit/Analytics.test.ts: plausible analytics tracker

import './globals.css';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Saved preference from the cookie so the server HTML already carries the
  // right data-theme; theme-init.js covers first visits (OS preference).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* Parser-blocking classic script: applies data-theme before first paint
            to prevent a theme flash. Must be synchronous and run before hydration,
            so the async-by-default next/script is not usable here. Source lives in
            public/theme-init.js. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="min-h-screen bg-will-dark text-will-light antialiased">
        <NextIntlClientProvider messages={messages}>
          <AuthSyncProvider>
            <ClientLayout>{children}</ClientLayout>
          </AuthSyncProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
