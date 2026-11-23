/**
 * Checks the size of the built client JavaScript against a budget (#837).
 *
 * It adds up the gzipped size of every `.js` file in `.next/static/chunks` after `npm run build`, which is
 * what a visitor downloads at most (the chunks of every route together), and fails when the total is
 * above the budget.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs                 budget 500 KB
 *   node scripts/check-bundle-size.mjs --budget=450    budget in KB
 *   BUNDLE_BUDGET_KB=450 node scripts/check-bundle-size.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHUNKS_DIR = join(ROOT, '.next', 'static', 'chunks');
const DEFAULT_BUDGET_KB = 500;

function findScripts(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return findScripts(full);
    return entry.endsWith('.js') ? [full] : [];
  });
}

export function readBudgetKb(argv = process.argv, env = process.env) {
  const flag = argv.find((arg) => arg.startsWith('--budget='));
  const value = Number(flag ? flag.slice('--budget='.length) : env.BUNDLE_BUDGET_KB ?? DEFAULT_BUDGET_KB);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('The budget must be a positive number of KB.');
  }
  return value;
}

function main() {
  const budgetKb = readBudgetKb();

  if (!existsSync(CHUNKS_DIR)) {
    console.error('No build found. Run `npm run build` first.');
    process.exit(2);
  }

  const sizes = findScripts(CHUNKS_DIR)
    .map((file) => ({ file: relative(ROOT, file), bytes: gzipSync(readFileSync(file)).length }))
    .sort((a, b) => b.bytes - a.bytes);
  const totalKb = sizes.reduce((sum, { bytes }) => sum + bytes, 0) / 1024;

  console.log('Largest chunks (gzipped):');
  for (const { file, bytes } of sizes.slice(0, 10)) {
    console.log(`  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${file}`);
  }
  console.log(`Total client JavaScript: ${totalKb.toFixed(1)} KB gzipped (budget ${budgetKb} KB)`);

  if (totalKb > budgetKb) {
    console.error(`Over budget by ${(totalKb - budgetKb).toFixed(1)} KB.`);
    process.exit(1);
  }
}

// Only run when called as a script, so the helpers can be imported.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
