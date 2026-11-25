import type { Metadata } from 'next';

import { getBranding } from '@/lib/branding';

import VerifyClient from './verify-client';

const branding = getBranding();

export const metadata: Metadata = {
  title: `Verify a will | ${branding.name}`,
  description: `Check a ${branding.name} certificate's signature and on-chain state.`,
  openGraph: {
    title: `Verify a will | ${branding.name}`,
    description: `Check a ${branding.name} certificate's signature and on-chain state.`,
    url: `${branding.siteUrl}/verify`,
    siteName: branding.name,
    type: 'website',
  },
};

export default function VerifyPage() {
  return <VerifyClient />;
}
