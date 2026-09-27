#!/usr/bin/env node
/**
 * Translation parity gate for CI and for the production build (issue #442).
 *
 * `src/messages/{en,es}.json` are loaded per request, so a key that exists in
 * English but not in Spanish does not fail anything — the page just renders the
 * key or falls back, and nobody notices until a Spanish visitor sees English
 * text. This script compares the two locales and exits non-zero on any
 * structural difference, so `npm run build` (via `prebuild`) refuses to ship a
 * half-translated app.
 *
 * Deliberately dependency-free and compiler-free, like the changelog gate.
 *
 * Usage: node scripts/check-messages.mjs [src/messages]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFERENCE_LOCALE = 'en';

/**
 * Every locale the app negotiates. Mirrors `supportedLocales` in
 * `src/i18n/negotiate.ts`; `tests/unit/faq-i18n.test.tsx` fails if the two lists
 * drift apart, so a new locale cannot be shipped without its messages file.
 */
export const REQUIRED_LOCALES = ['en', 'es'];

/**
 * Flattens a nested message object into `path -> kind` entries.
 * Arrays are reported per index so a shorter list is a difference, not a match.
 *
 * @param {unknown} value
 * @param {string} [prefix]
 * @returns {Map<string, string>}
 */
export function flattenMessages(value, prefix = '') {
  const leaves = new Map();

  if (Array.isArray(value)) {
    leaves.set(prefix || '(root)', 'array');
    value.forEach((entry, index) => {
      for (const [key, kind] of flattenMessages(entry, `${prefix}.${index}`)) {
        leaves.set(key, kind);
      }
    });
    return leaves;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [innerKey, kind] of flattenMessages(entry, path)) {
        leaves.set(innerKey, kind);
      }
    }
    return leaves;
  }

  leaves.set(prefix || '(root)', typeof value);
  return leaves;
}

/** Empty or whitespace-only strings are treated as missing translations. */
export function findEmptyStrings(value, prefix = '') {
  const empties = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      empties.push(...findEmptyStrings(entry, `${prefix}.${index}`));
    });
    return empties;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      empties.push(...findEmptyStrings(entry, prefix ? `${prefix}.${key}` : key));
    }
    return empties;
  }

  if (typeof value === 'string' && value.trim() === '') empties.push(prefix);
  return empties;
}

/**
 * Compares one locale against the reference locale.
 *
 * @param {object} reference
 * @param {object} candidate
 * @param {string} locale
 * @returns {string[]}
 */
export function compareMessages(reference, candidate, locale) {
  const referenceLeaves = flattenMessages(reference);
  const candidateLeaves = flattenMessages(candidate);
  const problems = [];

  for (const [path, kind] of referenceLeaves) {
    const translated = candidateLeaves.get(path);
    if (translated === undefined) {
      problems.push(`${locale}: missing key "${path}"`);
    } else if (translated !== kind) {
      problems.push(`${locale}: "${path}" is ${translated}, expected ${kind}`);
    }
  }

  for (const path of candidateLeaves.keys()) {
    if (!referenceLeaves.has(path)) problems.push(`${locale}: unexpected key "${path}"`);
  }

  for (const path of findEmptyStrings(candidate)) {
    problems.push(`${locale}: "${path}" is an empty string`);
  }

  return problems;
}

/**
 * @param {string} messagesDir
 * @returns {{locales: string[], problems: string[]}}
 */
export function checkMessagesDirectory(messagesDir = join(process.cwd(), 'src', 'messages')) {
  const files = readdirSync(messagesDir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const locales = files.map((file) => basename(file, '.json'));
  const problems = [];

  for (const locale of REQUIRED_LOCALES) {
    if (!locales.includes(locale)) {
      problems.push(`${locale}.json is missing from ${messagesDir}`);
    }
  }

  if (!locales.includes(REFERENCE_LOCALE)) {
    return { locales, problems };
  }

  const reference = JSON.parse(readFileSync(join(messagesDir, `${REFERENCE_LOCALE}.json`), 'utf8'));

  for (const locale of locales) {
    if (locale === REFERENCE_LOCALE) continue;
    const candidate = JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), 'utf8'));
    problems.push(...compareMessages(reference, candidate, locale));
  }

  const referenceEmpties = findEmptyStrings(reference);
  for (const path of referenceEmpties) {
    problems.push(`${REFERENCE_LOCALE}: "${path}" is an empty string`);
  }

  return { locales, problems };
}

function main() {
  const messagesDir = process.argv[2]
    ? resolve(process.argv[2])
    : join(process.cwd(), 'src', 'messages');
  const { locales, problems } = checkMessagesDirectory(messagesDir);

  if (problems.length > 0) {
    console.error(
      `✗ translations are not in sync (${locales.join(', ')}):\n- ${problems.join('\n- ')}`,
    );
    process.exit(1);
  }

  console.log(`✓ translations in sync: ${locales.join(', ')} (${messagesDir})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
