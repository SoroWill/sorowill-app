'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { themeCookie } from '@/lib/theme';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Restore the saved preference on mount. A valid stored value always wins
    // (matching public/theme-init.js); otherwise keep whatever the head
    // bootstrap script applied, and only then fall back to the OS preference.
    const stored = readStoredTheme();
    const applied = document.documentElement.getAttribute('data-theme');
    const initialTheme: Theme =
      stored ??
      (applied === 'light' || applied === 'dark' ? applied : getSystemTheme());

    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  // Follow OS preference changes while the user has not made an explicit
  // choice, so the initial system preference stays respected across sessions.
  useEffect(() => {
    if (readStoredTheme()) return;

    let media: MediaQueryList;
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme()) return;
      const nextTheme: Theme = event.matches ? 'dark' : 'light';
      setTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // Compute the next theme first, then run side effects outside the state
  // updater: updaters must stay pure because StrictMode may invoke them twice.
  const toggleTheme = () => {
    const newTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch {
      /* storage unavailable (e.g. privacy mode) - theme still applies for this session */
    }
    document.cookie = themeCookie(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Non-throwing variant of `useTheme` for components (e.g. the header's
 * ThemeToggle) that may render before or outside a ThemeProvider.
 */
export function useOptionalTheme(): ThemeContextType | undefined {
  return useContext(ThemeContext);
}
