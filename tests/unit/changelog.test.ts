import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  loadChangelog,
  parseChangelog,
  readPackageVersion,
  validateChangelog,
} from '@/lib/changelog';

/**
 * `scripts/validate-changelog.mjs` is the gate CI runs, but the page renders
 * through `src/lib/changelog.ts`. Two implementations of the same rules are a
 * drift risk, so the parity block at the bottom feeds the same fixtures to both
 * and fails if they ever disagree.
 */
const REPO_ROOT = process.cwd();
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'validate-changelog.mjs');
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'test.yml');

interface ScriptModule {
  parseChangelog: typeof parseChangelog;
  validateChangelog: typeof validateChangelog;
  validateRepository: (cwd: string) => {
    entries: ReturnType<typeof parseChangelog>;
    problems: string[];
    version: string | undefined;
  };
}

async function loadScriptModule(): Promise<ScriptModule> {
  // A computed specifier keeps TypeScript out of the .mjs file (`allowJs: false`)
  // while still loading the exact module the CI step executes. The URL is built
  // from a file path because Vite rewrites `import.meta.url` under vitest.
  const specifier = pathToFileURL(join(REPO_ROOT, 'scripts', 'validate-changelog.mjs')).href;
  return (await import(/* @vite-ignore */ specifier)) as ScriptModule;
}

/** Writes a throwaway repository root with the given changelog + version. */
function fixtureRoot(changelog: string, version = '1.0.0'): string {
  const dir = mkdtempSync(join(tmpdir(), 'sorowill-changelog-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version }));
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}

function runCli(dir: string) {
  return spawnSync(process.execPath, [SCRIPT_PATH, dir], { encoding: 'utf8' });
}

const VALID = [
  '# Changelog',
  '',
  '## v1.0.0 — Launch (July 2026)',
  '',
  '- First release',
  '- Second highlight',
  '',
  '## v0.9.0 — Release Candidate (June 2026)',
  '',
  '- Dashboard',
  '',
].join('\n');

describe('parseChangelog', () => {
  it('parses the repository changelog into entries', () => {
    const entries = parseChangelog(readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8'));

    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries[0]).toMatchObject({ version: 'v1.0.0', title: 'Launch', date: 'July 2026' });
    expect(entries[0].highlights.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.version)).toContain('v0.5.0');
  });

  it('keeps the release date out of the title but leaves other parentheticals alone', () => {
    const [dated] = parseChangelog('## v2.0.0 — Multi-asset support (August 2026)\n- thing\n');
    expect(dated.title).toBe('Multi-asset support');

    const [labelled] = parseChangelog('## v2.0.0 — Launch (beta)\n- thing\n');
    expect(labelled.title).toBe('Launch (beta)');
  });

  it('accepts the dash-separated heading form', () => {
    const [entry] = parseChangelog('## v3.1.4 - Hardening - September 2026\n- thing\n');
    expect(entry).toMatchObject({ version: 'v3.1.4', title: 'Hardening', date: 'September 2026' });
  });

  it('ignores content before the first version heading', () => {
    const entries = parseChangelog('# Changelog\n\nintro text\n\n## v1.0.0 — Launch (July 2026)\n- a\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].highlights).toEqual(['a']);
  });
});

describe('validateChangelog', () => {
  it('accepts a well-formed changelog', () => {
    expect(validateChangelog(parseChangelog(VALID), '1.0.0')).toEqual([]);
  });

  it('rejects an empty changelog', () => {
    expect(validateChangelog([], '1.0.0')[0]).toMatch(/no entries/);
  });

  it('rejects malformed versions, missing titles, bad dates and empty sections', () => {
    const problems = validateChangelog(
      [
        { version: '1.0', title: '', date: 'July 2, 2026', highlights: [] },
      ],
      undefined,
    );

    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/version must look like v1\.2\.3/);
    expect(problems.join('\n')).toMatch(/missing title/);
    expect(problems.join('\n')).toMatch(/date must look like/);
    expect(problems.join('\n')).toMatch(/no bullet highlights/);
  });

  it('rejects a changelog that has no entry for the released package version', () => {
    const problems = validateChangelog(parseChangelog(VALID), '9.9.9');
    expect(problems).toEqual(['CHANGELOG.md has no entry for the released version v9.9.9.']);
  });

  it('accepts a changelog whose latest entry is a newer version than package.json', () => {
    expect(validateChangelog(parseChangelog(VALID), '0.9.0')).toEqual([]);
  });
});

describe('loadChangelog', () => {
  it('loads and validates the repository changelog, and agrees with package.json', () => {
    const entries = loadChangelog(REPO_ROOT);
    const version = readPackageVersion(REPO_ROOT);

    expect(version).toBe(entries[0].version.replace(/^v/, ''));
  });

  it('throws when the changelog is out of sync with the released version', () => {
    const dir = fixtureRoot(VALID, '2.0.0');
    expect(() => loadChangelog(dir)).toThrow(/no entry for the released version v2\.0\.0/);
  });

  it('throws when CHANGELOG.md is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sorowill-empty-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(() => loadChangelog(dir)).toThrow(/ENOENT|no such file/i);
  });
});

describe('scripts/validate-changelog.mjs', () => {
  it('exits 0 and reports the latest entry for the repository changelog', () => {
    const result = runCli(REPO_ROOT);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/✓ CHANGELOG\.md/);
    expect(result.stdout).toMatch(/latest v1\.0\.0/);
  });

  it('exits 1 when the changelog has no entry for the current version', () => {
    const result = runCli(fixtureRoot(VALID, '2.0.0'));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no entry for the released version v2\.0\.0/);
  });

  it('exits 1 with every problem listed when the changelog is malformed', () => {
    const result = runCli(fixtureRoot('## 1.0.0\n\nno bullets here\n', '1.0.0'));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/version must look like v1\.2\.3/);
    expect(result.stderr).toMatch(/date must look like/);
    expect(result.stderr).toMatch(/no bullet highlights/);
  });

  it('exits 1 when CHANGELOG.md is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sorowill-nochangelog-'));
    const result = runCli(dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/CHANGELOG\.md is missing/);
  });

  it('is wired into the CI workflow before the build step', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

    expect(workflow).toContain('scripts/validate-changelog.mjs');
    expect(workflow.indexOf('validate-changelog.mjs')).toBeLessThan(workflow.indexOf('npm run build'));
  });
});

describe('parser parity between src/lib/changelog.ts and scripts/validate-changelog.mjs', () => {
  const fixtures: Array<[string, string | undefined]> = [
    [VALID, '1.0.0'],
    [VALID, '2.0.0'],
    ['# Changelog\nnothing here\n', '1.0.0'],
    ['## v3.1.4 - Hardening - September 2026\n- thing\n', undefined],
    ['## v2.0.0 — Launch (beta)\n- thing\n', '2.0.0'],
    ['## 1.0.0\n\nno bullets here\n', '1.0.0'],
    ['## v1.0.0 — Launch (July 2026)\n* asterisk bullet\n- dash bullet\n', '1.0.0'],
  ];

  it('produces identical entries and problems for every fixture', async () => {
    const script = await loadScriptModule();

    for (const [markdown, version] of fixtures) {
      const entries = parseChangelog(markdown);
      expect(script.parseChangelog(markdown)).toEqual(entries);
      expect(script.validateChangelog(script.parseChangelog(markdown), version)).toEqual(
        validateChangelog(entries, version),
      );
    }
  });

  it('reads the same package version as the TypeScript helper', async () => {
    const script = await loadScriptModule();

    expect(script.validateRepository(REPO_ROOT).version).toBe(readPackageVersion(REPO_ROOT));
    expect(script.validateRepository(REPO_ROOT).problems).toEqual([]);
  });
});
