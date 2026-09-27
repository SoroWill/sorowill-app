import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Single source of truth for the changelog page (issue #443).
 *
 * The page used to keep a hardcoded `CHANGELOG_ENTRIES` array, so a release
 * could ship without the site ever mentioning it, and nothing failed when the
 * release notes were missing or malformed. This module derives the entries from
 * `CHANGELOG.md` and validates them, so the same file that documents a release
 * is the one the page renders — and CI can fail early when it is out of date.
 *
 * `scripts/validate-changelog.mjs` mirrors these rules in plain JavaScript so
 * the CI gate needs no compiler; `tests/unit/changelog.test.ts` fails if the two
 * ever disagree.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

const SEMVER = /^v\d+\.\d+\.\d+$/;
const DATE = /^[A-Z][a-z]+ \d{4}$/;

/** Parses `CHANGELOG.md` in Keep-a-Changelog-ish form. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      const [, rest] = heading;
      // "v1.0.0 — Launch (July 2026)" or "v1.0.0 - Launch - July 2026"
      const parts = rest.split(/\s+[—–-]\s+/).map((part) => part.trim());
      const version = parts[0] ?? '';
      const dateMatch = rest.match(/\(([^)]+)\)/);
      const date = (dateMatch ? dateMatch[1] : (parts[2] ?? '')).trim();
      // Strip the release date from the title, but only when the parenthetical
      // actually is a date -- "Launch (beta)" must survive untouched.
      const rawTitle = parts[1] ?? '';
      const title =
        dateMatch && DATE.test(dateMatch[1].trim())
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

/** Returns human-readable problems; empty array means the changelog is valid. */
export function validateChangelog(entries: ChangelogEntry[], pkgVersion?: string): string[] {
  const problems: string[] = [];

  if (entries.length === 0) {
    problems.push('CHANGELOG.md has no entries (expected at least one "## vX.Y.Z - Title (Month YYYY)" section).');
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

/** Reads `package.json`'s version, if it has a usable one. */
export function readPackageVersion(cwd: string = process.cwd()): string | undefined {
  try {
    const version = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version;
    return typeof version === 'string' && version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Reads + validates the repository changelog. Throws so builds fail loudly. */
export function loadChangelog(cwd: string = process.cwd()): ChangelogEntry[] {
  const markdown = readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8');
  const entries = parseChangelog(markdown);

  const problems = validateChangelog(entries, readPackageVersion(cwd));
  if (problems.length > 0) {
    throw new Error(`Invalid CHANGELOG.md:\n- ${problems.join('\n- ')}`);
  }

  return entries;
}
