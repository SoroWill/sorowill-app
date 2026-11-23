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
      (applied === 'light' || applied === 'dark'
        ? applied
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light');

    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);

    // Without a saved choice the theme follows the OS, including when the OS
    // preference changes while the page is open. Choosing a theme with the
    // toggle saves it, after which the OS preference no longer applies (#809).
    if (stored !== null || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof query.addEventListener !== 'function') return;
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme() !== null) return;
      const systemTheme: Theme = event.matches ? 'dark' : 'light';
      setTheme(systemTheme);
      document.documentElement.setAttribute('data-theme', systemTheme);
    };
    query.addEventListener('change', onSystemChange);
    return () => query.removeEventListener('change', onSystemChange);
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
