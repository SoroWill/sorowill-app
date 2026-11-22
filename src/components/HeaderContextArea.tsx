'use client';

import { LanguageSelector } from '@/components/LanguageSelector';
import { NetworkMismatchBanner } from '@/components/NetworkMismatchBanner';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletConnect } from '@/components/WalletConnect';

export function HeaderContextArea({ onSessionChange }: { onSessionChange?: () => void } = {}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <LanguageSelector />
        <NetworkSwitcher />
        <ThemeToggle />
        <WalletConnect onSessionChange={onSessionChange} />
      </div>
      <NetworkMismatchBanner />
    </div>
  );
}
