export type Theme = 'light' | 'dark';

/** Cookie (and localStorage key) carrying the saved theme so the server can render it. */
export const THEME_COOKIE = 'theme';

/** localStorage key used to persist the user's explicit theme choice across sessions. */
export const THEME_STORAGE_KEY = 'theme';

/** Returns the value if it is a valid theme, otherwise undefined. */
export function parseTheme(value: string | null | undefined): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

/** `document.cookie` assignment persisting the theme for one year (kept in sync with public/theme-init.js). */
export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/** Reads the persisted theme from localStorage, falling back to the cookie. */
export function readStoredTheme(): Theme | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // localStorage may be unavailable (private mode, disabled storage).
  }
  const match = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
  return parseTheme(match ? decodeURIComponent(match[1]) : undefined);
}

/** Persists the theme choice to localStorage and the cookie so it survives reloads. */
export function persistTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures; the cookie below still persists the choice.
  }
  document.cookie = themeCookie(theme);
}

/** Resolves the initial theme: stored choice first, then the system preference. */
export function resolveInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}
