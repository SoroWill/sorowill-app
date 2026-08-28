'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import Image from 'next/image';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider } from '@/components/ThemeProvider';
import { HeaderContextArea } from '@/components/HeaderContextArea';

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isDashboardActive = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isCreateWillActive = pathname === '/will/new' || pathname.startsWith('/will/new/');

  return (
    <ThemeProvider>
      <ToastProvider>
        <header className="sticky top-0 z-10 border-b border-white/10 bg-will-dark/80 backdrop-blur dark:bg-will-dark/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-will-light">
            <Image src="/logo.svg" alt="SoroWill Logo" width={24} height={24} className="h-6 w-6 shrink-0" priority />
            Soro<span className="text-will-purple">Will</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-will-light/70 sm:flex">
            <Link
              href="/dashboard"
              className={
                isDashboardActive
                  ? 'text-will-purple font-semibold'
                  : 'hover:text-will-light transition-colors'
              }
              aria-current={isDashboardActive ? 'page' : undefined}
            >
              Dashboard
            </Link>
            <Link
              href="/will/new"
              className={
                isCreateWillActive
                  ? 'text-will-purple font-semibold'
                  : 'hover:text-will-light transition-colors'
              }
              aria-current={isCreateWillActive ? 'page' : undefined}
            >
              Create a Will
            </Link>
            <HeaderContextArea />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </ToastProvider>
    </ThemeProvider>
  );
}
