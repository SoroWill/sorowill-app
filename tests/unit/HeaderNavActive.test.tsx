import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClientLayout from '@/app/layout-client';

// Mock next/navigation
const mockPathname = vi.fn(() => '/dashboard');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

// Mock child components to avoid pulling in their dependencies
vi.mock('@/components/WalletConnect', () => ({
  WalletConnect: () => <div data-testid="wallet-connect" />,
}));
vi.mock('@/components/NetworkMismatchBanner', () => ({
  NetworkMismatchBanner: () => <div data-testid="network-banner" />,
}));
vi.mock('@/components/NetworkSwitcher', () => ({
  NetworkSwitcher: () => <div data-testid="network-switcher" />,
}));
vi.mock('@/components/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

describe('HeaderNavActive', () => {
  it('marks Dashboard link as active on /dashboard', () => {
    mockPathname.mockReturnValue('/dashboard');
    render(<ClientLayout><div /></ClientLayout>);

    const dashLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashLink).toHaveAttribute('aria-current', 'page');
    expect(dashLink.className).toContain('font-semibold');
  });

  it('marks Create a Will link as active on /will/new', () => {
    mockPathname.mockReturnValue('/will/new');
    render(<ClientLayout><div /></ClientLayout>);

    const createLink = screen.getByRole('link', { name: /create a will/i });
    expect(createLink).toHaveAttribute('aria-current', 'page');
    expect(createLink.className).toContain('font-semibold');
  });

  it('does not mark any link as active on /', () => {
    mockPathname.mockReturnValue('/');
    render(<ClientLayout><div /></ClientLayout>);

    const dashLink = screen.getByRole('link', { name: /dashboard/i });
    const createLink = screen.getByRole('link', { name: /create a will/i });
    expect(dashLink).not.toHaveAttribute('aria-current');
    expect(createLink).not.toHaveAttribute('aria-current');
  });

  it('marks Dashboard active on sub-routes like /dashboard/wills', () => {
    mockPathname.mockReturnValue('/dashboard/wills');
    render(<ClientLayout><div /></ClientLayout>);

    const dashLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashLink).toHaveAttribute('aria-current', 'page');
  });
});
