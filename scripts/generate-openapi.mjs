/**
 * Generates docs/openapi.json from the `@openapi` JSDoc blocks in src/app/api/** /route.ts (#833).
 *
 * A block looks like this, placed anywhere in a route file:
 *
 *   /**
 *    * @openapi GET
 *    * {
 *    *   "summary": "What the endpoint does",
 *    *   "responses": { "200": { "description": "OK" } }
 *    * }
 *    *\/
 *
 * The word after `@openapi` is the HTTP method. The JSON that follows is an OpenAPI operation object.
 * The path comes from the route's folder (`src/app/api/reminders/register/route.ts` becomes
 * `/api/reminders/register`, and `[id]` becomes `{id}`), so it cannot drift from the code.
 *
 * Usage:
 *   node scripts/generate-openapi.mjs            write docs/openapi.json
 *   node scripts/generate-openapi.mjs --check    exit 1 when docs/openapi.json is out of date
 *
 * It has no dependencies, so the JSON in the comments is plain JSON rather than YAML.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'src', 'app', 'api');
const OUTPUT = join(ROOT, 'docs', 'openapi.json');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function findRouteFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return findRouteFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

/** `src/app/api/reminders/[id]/route.ts` -> `/api/reminders/{id}` */
export function routePath(file) {
  const folder = relative(join(ROOT, 'src', 'app'), dirname(file)).split(sep).join('/');
  return `/${folder}`.replace(/\[([^\]]+)\]/g, '{$1}');
}

/** Pulls the `@openapi METHOD` blocks out of a source file's JSDoc comments. */
export function extractOperations(source, file) {
  const operations = [];
  for (const comment of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    const text = comment[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\* ?/, ''))
      .join('\n');
    const start = text.match(/@openapi[ \t]+([A-Za-z]+)[ \t]*\n/);
    if (!start) continue;

    const method = start[1].toUpperCase();
    if (!METHODS.includes(method)) {
      throw new Error(`${file}: "@openapi ${start[1]}" is not one of ${METHODS.join(', ')}`);
    }
    // The JSON runs to the next JSDoc tag or the end of the comment.
    const body = text.slice(start.index + start[0].length).split(/\n@\w/)[0];
    try {
      operations.push({ method: method.toLowerCase(), operation: JSON.parse(body) });
    } catch (error) {
      throw new Error(`${file}: the JSON after "@openapi ${method}" is not valid (${error.message})`);
    }
  }
  return operations;
}

export function buildSpec() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const paths = {};

  for (const file of findRouteFiles(API_DIR).sort()) {
    const path = routePath(file);
    for (const { method, operation } of extractOperations(readFileSync(file, 'utf8'), relative(ROOT, file))) {
      paths[path] ??= {};
      if (paths[path][method]) throw new Error(`${path} has two @openapi blocks for ${method.toUpperCase()}`);
      paths[path][method] = operation;
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'SoroWill API',
      version: pkg.version,
      description:
        'HTTP endpoints of the SoroWill web app. Generated from the @openapi comments in src/app/api; do not edit by hand. Run `npm run generate:openapi` after changing a route.',
    },
    servers: [{ url: '/', description: 'The deployment that serves this app' }],
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            ok: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Missing required fields' },
          },
        },
      },
      securitySchemes: {
        cronBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'The value of the CRON_SECRET environment variable.',
        },
      },
    },
  };
}

function main() {
  const generated = `${JSON.stringify(buildSpec(), null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== generated) {
      console.error('docs/openapi.json is out of date. Run `npm run generate:openapi` and commit the result.');
      process.exit(1);
    }
    console.log('docs/openapi.json is up to date.');
    return;
  }

  writeFileSync(OUTPUT, generated);
  console.log(`Wrote ${relative(ROOT, OUTPUT)}`);
}

// Only run when called as a script, so the helpers can be imported.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
