'use client';

import { LanguageSelector } from '@/components/LanguageSelector';
import { NetworkMismatchBanner } from '@/components/NetworkMismatchBanner';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletConnect } from '@/components/WalletConnect';

export function HeaderContextArea({ onSessionChange }: { onSessionChange?: () => void } = {}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col items-end gap-1.5 sm:gap-2">
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5 sm:gap-3 [&>*]:min-h-12 [&>*]:min-w-12">
        <LanguageSelector />
        <NetworkSwitcher />
        <ThemeToggle />
        <WalletConnect onSessionChange={onSessionChange} />
      </div>
      <NetworkMismatchBanner />
    </div>
  );
}
