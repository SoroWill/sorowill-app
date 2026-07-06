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
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-will-light">
              <svg viewBox="0 0 100 100" className="h-6 w-6 shrink-0" aria-hidden="true">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#7D00FF" strokeWidth="7" />
                <path
                  d="M0,50 L22,50 L34,26 L46,74 L58,26 L70,50 L100,50"
                  fill="none"
                  stroke="#08b5e5"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
