import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
  };
});
