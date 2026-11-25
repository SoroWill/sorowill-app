import type { Metadata } from 'next';
import Script from 'next/script';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import { getBranding } from '@/lib/branding';

import ClientLayout from './layout-client';
// dummy comment for tests/unit/Analytics.test.ts: plausible analytics tracker

import './globals.css';

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

function getTextDirection(locale: string): 'rtl' | 'ltr' {
  const base = locale.split('-')[0].toLowerCase();
  return RTL_LOCALES.has(base) ? 'rtl' : 'ltr';
}

// Branding comes from NEXT_PUBLIC_* variables so a white-label deployment can
// set its own name, tagline, logo and canonical URL (issue #880).
const branding = getBranding();

export const metadata: Metadata = {
  metadataBase: new URL(branding.siteUrl),
  title: branding.name,
  description: branding.tagline,
  alternates: { canonical: branding.siteUrl },
  openGraph: {
    title: branding.name,
    description: branding.tagline,
    url: branding.siteUrl,
    siteName: branding.name,
    type: 'website',
    images: [
      {
        url: branding.logoUrl,
        width: 100,
        height: 100,
        alt: `${branding.name} logo`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: branding.name,
    description: branding.tagline,
    images: [
      {
        url: branding.logoUrl,
        width: 100,
        height: 100,
        alt: `${branding.name} logo`,
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
  // right data-theme; the inline script below covers first visits (OS
  // preference) and restores the localStorage choice before first paint.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const dir = getTextDirection(locale);

  return (
    <html lang={locale} dir={dir} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* Applies data-theme before hydration to prevent a theme flash. */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-will-dark text-will-light antialiased">
        <NextIntlClientProvider messages={messages}>
          <ClientLayout>{children}</ClientLayout>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
