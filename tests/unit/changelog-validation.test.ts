/**
 * Unit tests for scripts/validate-changelog.mjs
 *
 * Covers issue #443: changelog/package-version sync validation.
 *
 * Tests the pure-logic exports (no filesystem access):
 *   - parseChangelogTopVersion
 *   - versionHasEntries
 *   - validateChangelog
 *
 * Also tests the prependChangelogEntry helper from bump-version.mjs.
 */

import { describe, it, expect } from 'vitest';
import {
  parseChangelogTopVersion,
  versionHasEntries,
  validateChangelog,
  // @ts-ignore - MJS files don't have type declarations
} from '../../scripts/validate-changelog.mjs';
import {
  prependChangelogEntry,
  // @ts-ignore - MJS files don't have type declarations
} from '../../scripts/bump-version.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WELL_FORMED = `
# Changelog

## [Unreleased]

## [1.2.3] - 2026-07-01

### Added
- Feature A

### Fixed
- Bug B

## [1.0.0] - 2026-01-01

### Added
- Initial release
`.trim();

const WITH_ONLY_UNRELEASED = `
# Changelog

## [Unreleased]

- Something upcoming
`.trim();

const NO_VERSION_HEADINGS = `
# Changelog

Some text but no version headings.
`.trim();

const EMPTY_VERSION_SECTION = `
# Changelog

## [2.0.0] - 2026-09-01

## [1.0.0] - 2026-01-01

### Added
- Initial release
`.trim();

// ---------------------------------------------------------------------------
// parseChangelogTopVersion
// ---------------------------------------------------------------------------

describe('parseChangelogTopVersion', () => {
  it('returns the first released version, skipping [Unreleased]', () => {
    expect(parseChangelogTopVersion(WELL_FORMED)).toBe('1.2.3');
  });

  it('returns null when only [Unreleased] is present', () => {
    expect(parseChangelogTopVersion(WITH_ONLY_UNRELEASED)).toBeNull();
  });

  it('returns null when there are no version headings at all', () => {
    expect(parseChangelogTopVersion(NO_VERSION_HEADINGS)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseChangelogTopVersion('')).toBeNull();
  });

  it('returns the version even without a date part', () => {
    const content = '## [0.5.0]\n\n### Added\n- Something\n';
    expect(parseChangelogTopVersion(content)).toBe('0.5.0');
  });

  it('is case-insensitive for [Unreleased]', () => {
    const content = '## [UNRELEASED]\n\n## [3.0.0] - 2026-01-01\n\n### Added\n- x\n';
    expect(parseChangelogTopVersion(content)).toBe('3.0.0');
  });

  it('ignores ## headings that are plain text (not version brackets)', () => {
    const content = '## Overview\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- x\n';
    expect(parseChangelogTopVersion(content)).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// versionHasEntries
// ---------------------------------------------------------------------------

describe('versionHasEntries', () => {
  it('returns true when a version section has content', () => {
    expect(versionHasEntries(WELL_FORMED, '1.2.3')).toBe(true);
  });

  it('returns true for a version with content even if it is not the first one', () => {
    expect(versionHasEntries(WELL_FORMED, '1.0.0')).toBe(true);
  });

  it('returns false when a version section is empty (no lines between headings)', () => {
    expect(versionHasEntries(EMPTY_VERSION_SECTION, '2.0.0')).toBe(false);
  });

  it('returns false for a version that does not exist in the changelog', () => {
    expect(versionHasEntries(WELL_FORMED, '9.9.9')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateChangelog — happy paths
// ---------------------------------------------------------------------------

describe('validateChangelog — success', () => {
  it('returns ok:true when top version matches package version and has content', () => {
    const result = validateChangelog(WELL_FORMED, '1.2.3');
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// validateChangelog — failure modes
// ---------------------------------------------------------------------------

describe('validateChangelog — version mismatch', () => {
  it('returns ok:false when changelog top version does not match package version', () => {
    const result = validateChangelog(WELL_FORMED, '1.0.0');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1\.2\.3/);   // changelog version
    expect(result.error).toMatch(/1\.0\.0/);   // package version
  });

  it('returns ok:false when changelog has no released versions', () => {
    const result = validateChangelog(WITH_ONLY_UNRELEASED, '1.2.3');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no released version/i);
  });

  it('returns ok:false for an empty changelog', () => {
    const result = validateChangelog('', '0.1.0');
    expect(result.ok).toBe(false);
  });
});

describe('validateChangelog — empty version section', () => {
  it('returns ok:false when the matching version section has no content', () => {
    const result = validateChangelog(EMPTY_VERSION_SECTION, '2.0.0');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no content/i);
  });
});

// ---------------------------------------------------------------------------
// prependChangelogEntry
// ---------------------------------------------------------------------------

describe('prependChangelogEntry', () => {
  it('inserts after [Unreleased] when present', () => {
    const content = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [1.0.0] - 2026-01-01',
      '',
      '### Added',
      '- Initial',
    ].join('\n');

    const result = prependChangelogEntry(content, '1.1.0', '2026-09-27');

    const unreleasedIndex = result.indexOf('## [Unreleased]');
    const newVersionIndex = result.indexOf('## [1.1.0]');
    const oldVersionIndex = result.indexOf('## [1.0.0]');

    expect(newVersionIndex).toBeGreaterThan(unreleasedIndex);
    expect(newVersionIndex).toBeLessThan(oldVersionIndex);
  });

  it('inserts before the first released version when no [Unreleased] section', () => {
    const content = [
      '# Changelog',
      '',
      '## [1.0.0] - 2026-01-01',
      '',
      '### Added',
      '- Initial',
    ].join('\n');

    const result = prependChangelogEntry(content, '1.1.0', '2026-09-27');

    const newVersionIndex = result.indexOf('## [1.1.0]');
    const oldVersionIndex = result.indexOf('## [1.0.0]');
    expect(newVersionIndex).toBeLessThan(oldVersionIndex);
  });

  it('includes the correct version and date in the stub', () => {
    const result = prependChangelogEntry('## [1.0.0]\n\n### Added\n- x\n', '2.0.0', '2026-09-27');
    expect(result).toContain('## [2.0.0] - 2026-09-27');
  });

  it('produces a changelog whose top version is the new version', () => {
    const content = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '## [0.1.0] - 2026-01-01',
      '',
      '### Added',
      '- Initial',
    ].join('\n');

    const updated = prependChangelogEntry(content, '0.2.0', '2026-09-27');
    expect(parseChangelogTopVersion(updated)).toBe('0.2.0');
  });
});
