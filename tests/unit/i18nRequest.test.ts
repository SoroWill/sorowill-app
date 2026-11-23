import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import es from '@/messages/es.json';

const state = vi.hoisted(() => ({ acceptLanguage: undefined as string | undefined }));

// getRequestConfig just wraps the function it is given, so hand the function straight back to call it in the test.
vi.mock('next-intl/server', () => ({
  getRequestConfig: (config: unknown) => config,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(state.acceptLanguage ? { 'accept-language': state.acceptLanguage } : {}),
  cookies: async () => ({ get: () => undefined }),
}));

type RequestConfig = (args: { requestLocale: Promise<string | undefined> }) => Promise<{
  locale: string;
  messages: unknown;
}>;

async function resolve(requestLocale: string | undefined) {
  const config = (await import('@/i18n/request')).default as unknown as RequestConfig;
  return config({ requestLocale: Promise.resolve(requestLocale) });
}

beforeEach(() => {
  state.acceptLanguage = undefined;
});

describe('i18n request config', () => {
  it('uses the locale the request already carries when it is supported', async () => {
    const result = await resolve('es');
    expect(result.locale).toBe('es');
    expect(result.messages).toEqual(es);
  });

  it('loads the English messages for English', async () => {
    const result = await resolve('en');
    expect(result.locale).toBe('en');
    expect(result.messages).toEqual(en);
  });

  it('falls back to the Accept-Language header when the request has no locale', async () => {
    state.acceptLanguage = 'es-MX,es;q=0.9,en;q=0.5';
    const result = await resolve(undefined);
    expect(result.locale).toBe('es');
    expect(result.messages).toEqual(es);
  });

  it('ignores a locale that is not supported and uses the header instead', async () => {
    state.acceptLanguage = 'es';
    const result = await resolve('fr');
    expect(result.locale).toBe('es');
  });

  it('uses English when nothing says otherwise', async () => {
    const result = await resolve(undefined);
    expect(result.locale).toBe('en');
    expect(result.messages).toEqual(en);
  });

  it('uses English when the header asks only for languages the app does not have', async () => {
    state.acceptLanguage = 'fr-FR,de;q=0.8';
    const result = await resolve(undefined);
    expect(result.locale).toBe('en');
  });
});
