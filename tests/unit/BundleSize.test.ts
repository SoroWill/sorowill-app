/**
 * Bundle Size Audit (#39)
 *
 * The heaviest third-party dependencies in the app are `jspdf` and `qrcode`,
 * both pulled in only by `src/lib/certificate.ts`. That module is loaded
 * exclusively through a dynamic `await import('@/lib/certificate')` in the
 * will detail page, which keeps jspdf/qrcode out of every route's first-load
 * bundle. A single static `import ... from '@/lib/certificate'` anywhere in
 * `src/` would silently undo that split.
 *
 * This suite enforces that invariant against real source (comments stripped,
 * so a comment cannot satisfy it) and, when a production build is present,
 * against the actual `.next` client chunk output.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src');

/** Matches any module specifier that resolves to `src/lib/certificate`. */
const CERTIFICATE_SPECIFIER = String.raw`['"](?:@/lib/certificate|(?:\.{1,2}/)+(?:[^'"\n]*/)?certificate)['"]`;

function walkSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkSourceFiles(full);
    }
    const isSource = /\.(ts|tsx|js|jsx)$/.test(entry.name);
    const isTestLike = /\.(test|spec|stories)\./.test(entry.name);
    return isSource && !isTestLike ? [full] : [];
  });
}

/** Removes block and line comments so commented-out code cannot match. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('Bundle Size Audit (#39)', () => {
  const sourceFiles = walkSourceFiles(SRC_DIR);
  const codeByFile = new Map(
    sourceFiles.map((file) => [
      path.relative(process.cwd(), file),
      stripComments(fs.readFileSync(file, 'utf-8')),
    ]),
  );

  it('has source files to analyze', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('never statically imports the jspdf/qrcode-heavy certificate module', () => {
    const staticImport = new RegExp(
      String.raw`(?:^|\n)\s*(?:import|export)\b[^;\n]*?(?:from\s*)?${CERTIFICATE_SPECIFIER}`,
    );
    const requireCall = new RegExp(String.raw`require\(\s*${CERTIFICATE_SPECIFIER}\s*\)`);

    const offenders = [...codeByFile.entries()]
      .filter(([, code]) => staticImport.test(code) || requireCall.test(code))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('loads the certificate module via a dynamic import so it is code-split', () => {
    const dynamicImport = new RegExp(String.raw`\bimport\(\s*${CERTIFICATE_SPECIFIER}\s*\)`);
    const dynamicSites = [...codeByFile.entries()]
      .filter(([, code]) => dynamicImport.test(code))
      .map(([file]) => file);

    expect(dynamicSites.length).toBeGreaterThan(0);
  });

  it('produces code-split client chunks in the production build when one exists', () => {
    const chunksDir = path.join(process.cwd(), '.next', 'static', 'chunks');
    if (!fs.existsSync(chunksDir)) {
      // No build in this environment (e.g. a local `vitest` run without
      // `next build`). CI builds before running tests, so this still guards.
      return;
    }

    const jsChunks: { name: string; size: number }[] = [];
    const collect = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(full);
        } else if (entry.name.endsWith('.js')) {
          jsChunks.push({ name: path.relative(chunksDir, full), size: fs.statSync(full).size });
        }
      }
    };
    collect(chunksDir);

    // Real code-splitting produces many chunks, not one monolith.
    expect(jsChunks.length).toBeGreaterThan(1);

    // No single client chunk should be pathologically large. 2 MB is far above
    // any legitimate chunk here and only trips on a bundling regression, such
    // as a heavy dependency leaking into a shared chunk.
    const oversized = jsChunks.filter((chunk) => chunk.size > 2 * 1024 * 1024);
    expect(oversized).toEqual([]);
  });
});
