import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

import enMessages from '../src/messages/en.json';

// Components like LanguageSelector call `useLocale()` from next-intl, which
// throws "No intl context found" outside a NextIntlClientProvider. Most
// tests render pages/components (e.g. the shared header) without wrapping
// every tree in a provider just for this, so default it to 'en' globally --
// tests that specifically exercise next-intl (e.g. GuardianPanel.test.tsx)
// still wrap with a real NextIntlClientProvider, which this does not affect.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => 'en',
    // Components that translate their text render without a provider in most tests, so use the
    // English catalog then; a test that wraps its tree in a NextIntlClientProvider still gets that one.
    useTranslations: (namespace?: string) => {
      try {
        return actual.useTranslations(namespace);
      } catch {
        return actual.createTranslator({ locale: 'en', messages: enMessages, namespace } as never);
      }
    },
  };
});

// Polyfill localStorage when running under Node 22+ where globalThis.localStorage
// can be undefined without `--localstorage-file`.
const createStorage = () => {
  let store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
};

const storageInstance = createStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageInstance,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: storageInstance,
    writable: true,
    configurable: true,
  });
}

