import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';

function stubPrefersDark(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

describe('ThemeProvider (#320)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores an invalid stored theme and falls back to the OS preference', () => {
    stubPrefersDark(false);
    localStorage.setItem('theme', 'blue');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('writes the toggled theme exactly once under StrictMode', () => {
    stubPrefersDark(true);
    document.documentElement.setAttribute('data-theme', 'dark');
    const setItem = vi.spyOn(localStorage, 'setItem');

    render(
      <StrictMode>
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>
      </StrictMode>,
    );

    // Clear any calls from initialization
    setItem.mockClear();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(setItem).toHaveBeenCalledWith('theme', 'light');
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('restores the saved preference on mount across a reload (#394)', () => {
    stubPrefersDark(true);

    const first = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem('theme')).toBe('light');
    first.unmount();

    // Simulate a fresh page load: DOM attribute gone, only storage survives.
    document.documentElement.removeAttribute('data-theme');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('prefers the saved theme over a conflicting data-theme attribute', () => {
    stubPrefersDark(true);
    localStorage.setItem('theme', 'light');
    document.documentElement.setAttribute('data-theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the OS preference when storage is unavailable', () => {
    stubPrefersDark(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('light');
  });
});
