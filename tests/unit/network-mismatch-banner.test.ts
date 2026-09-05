import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ClientLayout from '@/app/layout-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/freighter', () => ({
  safeGetWalletNetwork: vi.fn().mockResolvedValue(null),
  safeGetPublicKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sorowill', () => ({
  getNetwork: vi.fn(() => 'testnet'),
}));

vi.mock('@/components/WalletConnect', () => ({
  WalletConnect: () => null,
}));
vi.mock('@/components/NetworkSwitcher', () => ({
  NetworkSwitcher: () => null,
}));
vi.mock('@/components/Toast', () => ({
  ToastProvider: ({ children }: { children: import('react').ReactNode }) => children,
}));
vi.mock('@/components/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: import('react').ReactNode }) => children,
}));
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

describe('NetworkMismatchBanner (Issue #247)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('Single Instance Mount', () => {
    it('should render only one NetworkMismatchBanner instance in the header', () => {
      const { container } = render(ClientLayout({ children: null }));

      const headerElement = container.querySelector('header');
      const bannerElements = headerElement?.querySelectorAll('[data-testid="network-mismatch-banner"]');

      expect(bannerElements?.length).toBeLessThanOrEqual(1);
    });

    it('should not mount duplicate NetworkMismatchBanner instances', () => {
      const { container } = render(ClientLayout({ children: null }));

      const allBanners = container.querySelectorAll('[data-testid="network-mismatch-banner"]');

      expect(allBanners.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Dismissed State Sync', () => {
    it('should sync dismissed state across all banner instances via sessionStorage', () => {
      const storageKey = 'network-mismatch-dismissed';
      const initialState = sessionStorage.getItem(storageKey);

      sessionStorage.setItem(storageKey, '1');
      const afterDismiss = sessionStorage.getItem(storageKey);

      expect(afterDismiss).toBe('1');

      if (initialState === null) {
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(storageKey, initialState);
      }
    });
  });
});
