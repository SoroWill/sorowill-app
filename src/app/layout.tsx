import type { Metadata } from 'next';
import Link from 'next/link';

import { WalletConnect } from '@/components/WalletConnect';

import './globals.css';

export const metadata: Metadata = {
  title: 'SoroWill',
  description: 'Trustless on-chain inheritance on Stellar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-will-dark text-will-light antialiased">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-will-dark/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight text-will-light">
              Soro<span className="text-will-purple">Will</span>
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-will-light/70 sm:flex">
              <Link href="/dashboard" className="hover:text-will-light">
                Dashboard
              </Link>
              <Link href="/will/new" className="hover:text-will-light">
                Create a Will
              </Link>
            </nav>
            <WalletConnect />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
