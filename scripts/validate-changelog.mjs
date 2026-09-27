#!/usr/bin/env node
/**
 * Release-notes gate for CI (issue #443).
 *
 * `CHANGELOG.md` is the single source of truth for the `/changelog` page, but
 * nothing stopped a release from shipping with no notes, a malformed version
 * heading, or a version that did not match `package.json`. This script fails
 * the build in those cases.
 *
 * Why a plain `.mjs` file instead of importing `src/lib/changelog.ts`: the gate
 * has to run in CI (and in the production build) before anything is compiled,
 * so it must not depend on the TypeScript toolchain. The parsing rules below are
 * therefore mirrors of the ones in `src/lib/changelog.ts`, and
 * `tests/unit/changelog.test.ts` asserts that both implementations agree on a
 * set of fixtures — that test is what stops the two from drifting apart.
 *
 * Usage:
 *   node scripts/validate-changelog.mjs [repo-root]
 *
 * Exits 0 when the changelog is valid, 1 with a list of problems otherwise.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^v\d+\.\d+\.\d+$/;
const DATE = /^[A-Z][a-z]+ \d{4}$/;
const CHANGELOG_FILE = 'CHANGELOG.md';

/**
 * Parses `CHANGELOG.md` in Keep-a-Changelog-ish form:
 *
 *   ## v1.2.3 — Title (July 2026)
 *   - highlight
 *
 * @param {string} markdown
 * @returns {Array<{version: string, date: string, title: string, highlights: string[]}>}
 */
export function parseChangelog(markdown) {
  const entries = [];
  let current = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      const rest = heading[1];
      // "v1.0.0 — Launch (July 2026)" or "v1.0.0 - Launch - July 2026"
      const parts = rest.split(/\s+[—–-]\s+/).map((part) => part.trim());
      const version = parts[0] ?? '';
      const dateMatch = rest.match(/\(([^)]+)\)/);
      const date = (dateMatch ? dateMatch[1] : (parts[2] ?? '')).trim();
      // Strip the release date from the title, but only when the parenthetical
      // actually is a date -- "Launch (beta)" must survive untouched.
      const rawTitle = parts[1] ?? '';
      const title = dateMatch && DATE.test(dateMatch[1].trim())
        ? rawTitle.replace(/\s*\([^)]*\)\s*$/, '').trim()
        : rawTitle;

      current = { version, title, date, highlights: [] };
      entries.push(current);
      continue;
    }

    if (!current) continue;

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) current.highlights.push(bullet[1].trim());
  }

  return entries;
}

/**
 * Returns human-readable problems; an empty array means the changelog is valid.
 *
 * @param {Array<{version: string, date: string, title: string, highlights: string[]}>} entries
 * @param {string} [pkgVersion] version from package.json, without the leading "v"
 * @returns {string[]}
 */
export function validateChangelog(entries, pkgVersion) {
  const problems = [];

  if (entries.length === 0) {
    problems.push(
      'CHANGELOG.md has no entries (expected at least one "## vX.Y.Z - Title (Month YYYY)" section).',
    );
    return problems;
  }

  entries.forEach((entry, index) => {
    const where = `entry #${index + 1} (${entry.version || 'no version'})`;
    if (!SEMVER.test(entry.version)) problems.push(`${where}: version must look like v1.2.3.`);
    if (!entry.title) problems.push(`${where}: missing title after the version.`);
    if (!DATE.test(entry.date)) problems.push(`${where}: date must look like "July 2026".`);
    if (entry.highlights.length === 0) problems.push(`${where}: no bullet highlights.`);
  });

  if (pkgVersion) {
    const expected = `v${pkgVersion}`;
    if (entries[0].version !== expected && !entries.some((entry) => entry.version === expected)) {
      problems.push(`CHANGELOG.md has no entry for the released version ${expected}.`);
    }
  }

  return problems;
}

/**
 * Reads `package.json`'s version; `undefined` when the file is missing or has no
 * usable version, so a malformed package.json cannot be reported as a changelog
 * problem.
 *
 * @param {string} cwd
 * @returns {string | undefined}
 */
export function readPackageVersion(cwd) {
  try {
    const version = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version;
    return typeof version === 'string' && version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} cwd
 * @returns {{entries: Array<object>, problems: string[], version: string | undefined}}
 */
export function validateRepository(cwd = process.cwd()) {
  let markdown;
  try {
    markdown = readFileSync(join(cwd, CHANGELOG_FILE), 'utf8');
  } catch {
    return {
      entries: [],
      problems: [`${CHANGELOG_FILE} is missing from the repository root.`],
      version: readPackageVersion(cwd),
    };
  }

  const version = readPackageVersion(cwd);
  const entries = parseChangelog(markdown);
  return { entries, problems: validateChangelog(entries, version), version };
}

function main() {
  const cwd = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  const { entries, problems, version } = validateRepository(cwd);

  if (problems.length > 0) {
    console.error(`✗ ${CHANGELOG_FILE} is not release-ready:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }

  const latest = entries[0];
  console.log(
    `✓ ${CHANGELOG_FILE}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, ` +
      `latest ${latest.version} (${latest.date}), package.json ${version ? `v${version}` : 'version unknown'}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
