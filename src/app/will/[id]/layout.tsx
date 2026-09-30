import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isValidWillId } from '@/lib/willId';

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

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
