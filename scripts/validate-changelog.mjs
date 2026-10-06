import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseChangelogTopVersion(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^##\s+\[([^\]]+)\]/);
    if (!match) continue;
    const version = match[1];
    if (version.toLowerCase() !== 'unreleased') {
      return version;
    }
  }
  return null;
}

export function versionHasEntries(content, version) {
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    const match = line.match(/^##\s+\[([^\]]+)\]/);
    if (match && match[1] === version) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (match) return false;
      if (line.trim() && !line.startsWith('#')) {
        return true;
      }
    }
  }
  return false;
}

export function validateChangelog(content, packageVersion) {
  if (!content.trim()) {
    return { ok: false, error: 'Changelog is empty' };
  }
  const topVersion = parseChangelogTopVersion(content);
  if (!topVersion) {
    return { ok: false, error: 'Changelog has no released version' };
  }
  if (topVersion !== packageVersion) {
    return { ok: false, error: `Changelog version ${topVersion} does not match package version ${packageVersion}` };
  }
  if (!versionHasEntries(content, topVersion)) {
    return { ok: false, error: `Version ${topVersion} has no content` };
  }
  return { ok: true };
}

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const version = `v${pkg.version}`;
if (!new RegExp(`^##\\s+${version.replaceAll('.', '\\.')}(?:\\s|$)`, 'm').test(changelog)) {
  console.error(`CHANGELOG.md must contain an entry for ${version}`);
  process.exit(1);
}
console.log(`Changelog contains ${version}`);
