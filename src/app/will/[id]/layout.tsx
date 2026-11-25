import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isValidWillId } from '@/lib/willId';
import { willAppUrl, willWebUrl } from '@/lib/deepLink';

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isValidWillId(id)) return metadata;

  return {
    ...metadata,
    alternates: {
      canonical: willWebUrl(id),
    },
    other: {
      // Universal link / App Link hints for the SoroWill mobile app.
      'al:ios:url': willAppUrl(id),
      'al:android:url': willAppUrl(id),
      'al:web:url': willWebUrl(id),
    },
  };
}

export default async function WillDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidWillId(id)) {
    notFound();
  }

  return <>{children}</>;
}
