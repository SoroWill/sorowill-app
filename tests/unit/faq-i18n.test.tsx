import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';

import FAQPage from '@/app/faq/page';
import { supportedLocales } from '@/i18n/negotiate';
import enMessages from '@/messages/en.json';
import esMessages from '@/messages/es.json';

/**
 * Issue #442: the FAQ page used to hardcode English copy while the rest of the
 * app was translated. These tests render the real page in both locales and drive
 * the translation gate (`scripts/check-messages.mjs`) the build now depends on.
 */
const REPO_ROOT = process.cwd();
const MESSAGES_DIR = join(REPO_ROOT, 'src', 'messages');
const CHECKER = join(REPO_ROOT, 'scripts', 'check-messages.mjs');

interface CheckerModule {
  flattenMessages: (value: unknown, prefix?: string) => Map<string, string>;
  findEmptyStrings: (value: unknown, prefix?: string) => string[];
  compareMessages: (reference: object, candidate: object, locale: string) => string[];
  checkMessagesDirectory: (dir?: string) => { locales: string[]; problems: string[] };
}

async function loadChecker(): Promise<CheckerModule> {
  const specifier = pathToFileURL(CHECKER).href;
  return (await import(/* @vite-ignore */ specifier)) as CheckerModule;
}

function renderFaq(locale: 'en' | 'es') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'es' ? esMessages : enMessages}
    >
      <FAQPage />
    </NextIntlClientProvider>,
  );
}

function runChecker(dir?: string) {
  return spawnSync(process.execPath, [CHECKER, ...(dir ? [dir] : [])], { encoding: 'utf8' });
}

/** A copy of src/messages that can be mutated without touching the repository. */
function messagesFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sorowill-messages-'));
  const target = join(dir, 'messages');
  cpSync(MESSAGES_DIR, target, { recursive: true });
  return target;
}

describe('FAQPage in Spanish', () => {
  it('renders the translated heading, lifecycle steps and questions', () => {
    renderFaq('es');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Cómo funciona y Preguntas Frecuentes',
    );
    expect(screen.getByText('El ciclo de vida completo')).toBeInTheDocument();
    // The first lifecycle step and the call-to-action button share this label.
    expect(screen.getAllByText('Crear un Testamento')).toHaveLength(2);
    expect(screen.getByText('¿Cómo funciona SoroWill?')).toBeInTheDocument();
    expect(
      screen.getByText(/SoroWill es un contrato inteligente en Stellar Soroban/),
    ).toBeInTheDocument();
  });

  it('leaves no English FAQ behind', () => {
    const { container } = renderFaq('es');

    expect(screen.queryByText('How does SoroWill work?')).not.toBeInTheDocument();
    expect(screen.queryByText('How it Works & FAQ')).not.toBeInTheDocument();

    const text = container.textContent ?? '';
    for (const item of enMessages.faq.items) {
      expect(text).not.toContain(item.question);
    }
  });

  it('renders every FAQ item and lifecycle step in both locales', () => {
    for (const [locale, messages] of [
      ['en', enMessages],
      ['es', esMessages],
    ] as const) {
      const { container, unmount } = renderFaq(locale);

      expect(container.querySelectorAll('details')).toHaveLength(messages.faq.items.length);
      expect(container.querySelectorAll('details')).toHaveLength(16);
      expect(container.querySelectorAll('h3')).toHaveLength(messages.faq.steps.length);
      expect(container.querySelectorAll('h3')).toHaveLength(5);

      // The zero-padded step numbers are generated from the array index, so a
      // shorter Spanish list would silently drop a step without failing above.
      expect(screen.getByText('01')).toBeInTheDocument();
      expect(screen.getByText('05')).toBeInTheDocument();

      unmount();
    }
  });

  it('keeps the English copy byte-identical to the pre-migration page', () => {
    const { container } = renderFaq('en');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How it Works & FAQ');
    expect(screen.getByText('The Full Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('How does SoroWill work?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Your Will' })).toHaveAttribute(
      'href',
      '/will/new',
    );
    expect(container.querySelectorAll('details')).toHaveLength(16);
  });
});

describe('faq namespace parity', () => {
  it('is a real translation, not a copy of the English copy', () => {
    const english = enMessages.faq.items.map((item) => item.question);
    const spanish = esMessages.faq.items.map((item) => item.question);

    expect(spanish).toHaveLength(english.length);
    english.forEach((question, index) => {
      expect(spanish[index]).not.toBe(question);
    });
  });

  it('has no structural differences between the locales', async () => {
    const checker = await loadChecker();
    expect(checker.compareMessages(enMessages, esMessages, 'es')).toEqual([]);
  });
});

describe('scripts/check-messages.mjs', () => {
  it('passes for the repository messages', () => {
    const result = runChecker();

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/✓ translations in sync: en, es/);
  });

  it('fails when a Spanish key is missing, naming it', () => {
    const dir = messagesFixture();
    const spanish = JSON.parse(readFileSync(join(dir, 'es.json'), 'utf8'));
    delete spanish.faq.ctaButton;
    writeFileSync(join(dir, 'es.json'), JSON.stringify(spanish, null, 2));

    const result = runChecker(dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/es: missing key "faq\.ctaButton"/);
  });

  it('fails when a Spanish FAQ item is dropped, even though the key exists', () => {
    const dir = messagesFixture();
    const spanish = JSON.parse(readFileSync(join(dir, 'es.json'), 'utf8'));
    spanish.faq.items = spanish.faq.items.slice(0, 15);
    writeFileSync(join(dir, 'es.json'), JSON.stringify(spanish, null, 2));

    const result = runChecker(dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/es: missing key "faq\.items\.15/);
  });

  it('fails when a translation is left empty', () => {
    const dir = messagesFixture();
    const spanish = JSON.parse(readFileSync(join(dir, 'es.json'), 'utf8'));
    spanish.faq.title = '';
    writeFileSync(join(dir, 'es.json'), JSON.stringify(spanish, null, 2));

    const result = runChecker(dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/es: "faq\.title" is an empty string/);
  });

  it('fails when a locale file is removed entirely', () => {
    const dir = messagesFixture();
    rmSync(join(dir, 'es.json'));

    const result = runChecker(dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/es\.json is missing/);
  });

  it('is wired into the production build', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(pkg.scripts['check:messages']).toContain('scripts/check-messages.mjs');
    expect(pkg.scripts.prebuild).toContain('check:messages');
    // npm runs `prebuild` before `build`, so a half-translated app cannot deploy.
    expect(pkg.scripts.build).toBe('next build');
  });

  it('checks exactly the locales the app negotiates', async () => {
    const checker = await loadChecker();

    expect((checker as unknown as { REQUIRED_LOCALES: string[] }).REQUIRED_LOCALES).toEqual([
      ...supportedLocales,
    ]);
  });
});

describe('messages files', () => {
  it('cover the same locales as the i18n negotiation list', () => {
    expect(readdirSync(MESSAGES_DIR).sort()).toEqual(
      supportedLocales.map((locale) => `${locale}.json`).sort(),
    );
  });
});
