#!/usr/bin/env node
/**
 * Release-metadata bump for issue #443.
 *
 * Keeps the two files that describe a release in step: `package.json` (and the
 * duplicated version fields in `package-lock.json`) and `CHANGELOG.md`, which is
 * what `/changelog` renders and what `scripts/validate-changelog.mjs` validates.
 * Bumping by hand is what let the two drift apart in the first place.
 *
 * Usage:
 *   node scripts/bump-release.mjs 1.1.0 \
 *     --title "Multi-asset support" \
 *     --notes-file notes.txt          # or: --bullet "..." (repeatable)
 *     [--date "September 2026"]       # defaults to the current month
 *
 * Exits non-zero (and writes nothing) when the version is not semver, no
 * highlights are given, or the target version already exists in CHANGELOG.md.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Parses `--flag value` pairs plus repeatable `--bullet` flags.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const options = { bullets: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case '--title':
        options.title = next();
        break;
      case '--notes-file':
        options.notesFile = next();
        break;
      case '--date':
        options.date = next();
        break;
      case '--bullet':
        options.bullets.push(next());
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
        options.version = arg;
    }
  }

  return options;
}

/** Current month + year, e.g. "September 2026". */
export function currentReleaseDate(now = new Date()) {
  return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Builds the `## vX.Y.Z — Title (Month YYYY)` section.
 * @param {{version: string, title: string, date: string, bullets: string[]}} release
 */
export function buildSection(release) {
  return [
    `## v${release.version} — ${release.title} (${release.date})`,
    '',
    ...release.bullets.map((bullet) => `- ${bullet}`),
    '',
  ].join('\n');
}

/**
 * Inserts the new section above the previous newest one, so the file stays in
 * newest-first order that `parseChangelog` relies on.
 * @param {string} markdown
 * @param {string} section
 */
export function prependSection(markdown, section) {
  const lines = markdown.split(/\r?\n/);
  const firstHeading = lines.findIndex((line) => /^##\s+/.test(line.trim()));

  if (firstHeading === -1) {
    const trimmed = markdown.replace(/\s*$/, '');
    return `${trimmed}\n\n${section}`;
  }

  const before = lines.slice(0, firstHeading).join('\n').replace(/\s*$/, '');
  const after = lines.slice(firstHeading).join('\n').replace(/\s*$/, '');
  return `${before}\n\n${section}${after}\n`;
}

/**
 * @param {{version: string, title: string, date: string, bullets: string[], cwd?: string}} release
 */
export function applyRelease(release, cwd = process.cwd()) {
  const version = release.version.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`version must look like 1.2.3, got "${release.version}"`);
  }
  if (!release.title) throw new Error('--title is required');
  if (release.bullets.length === 0) {
    throw new Error('at least one --bullet (or a non-empty --notes-file) is required');
  }

  const changelogPath = join(cwd, 'CHANGELOG.md');
  const changelog = readFileSync(changelogPath, 'utf8');
  if (new RegExp(`^##\\s+v${version.replace(/\./g, '\\.')}\\s`, 'm').test(changelog)) {
    throw new Error(`CHANGELOG.md already has a v${version} section`);
  }

  const pkgPath = join(cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // npm keeps its own copy of the root version in the lockfile; leaving it
  // behind makes `npm ci` and the lockfile disagree with package.json.
  const lockPath = join(cwd, 'package-lock.json');
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  } catch {
    // No lockfile in this checkout: nothing else to keep in sync.
  }

  const section = buildSection({ ...release, version });
  writeFileSync(changelogPath, prependSection(changelog, section));

  return { version, section };
}

function readNotes(options) {
  if (!options.notesFile) return options.bullets;
  return readFileSync(options.notesFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.version) throw new Error('usage: bump-release.mjs <version> --title "..." --notes-file notes.txt');

  const release = {
    version: options.version,
    title: options.title,
    date: options.date ?? currentReleaseDate(),
    bullets: readNotes(options),
  };

  const { version } = applyRelease(release);
  console.log(`✓ package.json, package-lock.json and CHANGELOG.md updated to v${version}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
