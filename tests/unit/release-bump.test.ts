import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * `scripts/bump-release.mjs` is what the Release metadata workflow runs
 * (issue #443). These tests drive the real CLI against a throwaway repository so
 * the workflow's exact sequence — bump, then validate — is covered end to end.
 */
const REPO_ROOT = process.cwd();
const BUMP_SCRIPT = join(REPO_ROOT, 'scripts', 'bump-release.mjs');
const VALIDATE_SCRIPT = join(REPO_ROOT, 'scripts', 'validate-changelog.mjs');

interface ScriptModule {
  buildSection: (release: {
    version: string;
    title: string;
    date: string;
    bullets: string[];
  }) => string;
  prependSection: (markdown: string, section: string) => string;
  currentReleaseDate: (now?: Date) => string;
  parseArgs: (argv: string[]) => { version?: string; bullets: string[]; title?: string };
}

async function loadScriptModule(): Promise<ScriptModule> {
  const specifier = pathToFileURL(join(REPO_ROOT, 'scripts', 'bump-release.mjs')).href;
  return (await import(/* @vite-ignore */ specifier)) as ScriptModule;
}

function fixtureRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'sorowill-release-'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`);
  writeFileSync(
    join(dir, 'package-lock.json'),
    `${JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, 'CHANGELOG.md'),
    ['# Changelog', '', '## v1.0.0 — Launch (July 2026)', '', '- First release', ''].join('\n'),
  );
  return dir;
}

function readVersion(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
}

function runBump(dir: string, args: string[]) {
  return spawnSync(process.execPath, [BUMP_SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
}

describe('bump-release.mjs', () => {
  it('updates package.json, package-lock.json and CHANGELOG.md together, then validates', () => {
    const dir = fixtureRoot();

    const bump = runBump(dir, ['1.1.0', '--title', 'Multi-asset support', '--date', 'September 2026', '--bullet', 'USDC and EURC', '--bullet', 'Guardian hand-off']);
    expect(bump.status).toBe(0);
    expect(bump.stdout).toMatch(/updated to v1\.1\.0/);

    expect(readVersion(dir)).toBe('1.1.0');
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe('1.1.0');
    expect(lock.packages[''].version).toBe('1.1.0');

    const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('## v1.1.0 — Multi-asset support (September 2026)');
    expect(changelog).toContain('- USDC and EURC');
    // Newest first: this is what parseChangelog and the page rely on.
    expect(changelog.indexOf('## v1.1.0')).toBeLessThan(changelog.indexOf('## v1.0.0'));

    const validate = spawnSync(process.execPath, [VALIDATE_SCRIPT, dir], { encoding: 'utf8' });
    expect(validate.status).toBe(0);
    expect(validate.stdout).toMatch(/latest v1\.1\.0/);
  });

  it('takes highlights from a notes file, one bullet per line', () => {
    const dir = fixtureRoot();
    const notes = join(dir, 'notes.txt');
    writeFileSync(notes, 'First highlight\n\n* Second highlight\n- Third highlight\n');

    const bump = runBump(dir, ['2.0.0', '--title', 'Hardening', '--date', 'September 2026', '--notes-file', notes]);
    expect(bump.status).toBe(0);

    const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('- First highlight');
    expect(changelog).toContain('- Second highlight');
    expect(changelog).toContain('- Third highlight');
    // The raw notes file must not be smuggled in as a single blob line.
    expect(changelog).not.toContain('- * Second highlight');
  });

  it('refuses a non-semver version and writes nothing', () => {
    const dir = fixtureRoot();

    const bump = runBump(dir, ['v1.1', '--title', 'Nope', '--bullet', 'something']);
    expect(bump.status).toBe(1);
    expect(bump.stderr).toMatch(/version must look like 1\.2\.3/);
    expect(readVersion(dir)).toBe('1.0.0');
  });

  it('refuses a release without highlights, so the changelog never fails the gate', () => {
    const dir = fixtureRoot();

    const bump = runBump(dir, ['1.1.0', '--title', 'Empty']);
    expect(bump.status).toBe(1);
    expect(bump.stderr).toMatch(/at least one --bullet/);
    expect(readVersion(dir)).toBe('1.0.0');
  });

  it('refuses to re-release a version that is already documented', () => {
    const dir = fixtureRoot();

    const bump = runBump(dir, ['1.0.0', '--title', 'Duplicate', '--bullet', 'again']);
    expect(bump.status).toBe(1);
    expect(bump.stderr).toMatch(/already has a v1\.0\.0 section/);
  });
});

describe('bump-release helpers', () => {
  it('derives the release date from the clock', async () => {
    const script = await loadScriptModule();
    expect(script.currentReleaseDate(new Date('2026-09-27T12:00:00Z'))).toBe('September 2026');
    expect(script.currentReleaseDate(new Date('2027-01-02T12:00:00Z'))).toBe('January 2027');
  });

  it('appends a section when the changelog has no version headings yet', async () => {
    const script = await loadScriptModule();
    const section = script.buildSection({
      version: '1.0.0',
      title: 'Launch',
      date: 'July 2026',
      bullets: ['First release'],
    });

    const result = script.prependSection('# Changelog\n', section);
    expect(result).toContain('## v1.0.0 — Launch (July 2026)');
    expect(result.indexOf('# Changelog')).toBeLessThan(result.indexOf('## v1.0.0'));
  });
});
