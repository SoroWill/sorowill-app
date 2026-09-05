import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderContextArea } from '@/components/HeaderContextArea';
import { ThemeProvider } from '@/components/ThemeProvider';

// Mock freighter lib
vi.mock('@/lib/freighter', () => ({
  safeGetPublicKey: vi.fn().mockResolvedValue(null),
  safeGetWalletNetwork: vi.fn().mockResolvedValue(null),
  truncateAddress: (addr: string) => addr,
}));

// LanguageSelector (rendered inside HeaderContextArea) calls useRouter(),
// which throws outside a real Next.js App Router context.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

// ThemeProvider reads matchMedia on mount to detect OS color scheme; jsdom doesn't implement it.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

describe('HeaderContextArea', () => {
  it('renders unified header context controls', () => {
    render(
      <ThemeProvider>
        <HeaderContextArea />
      </ThemeProvider>
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
