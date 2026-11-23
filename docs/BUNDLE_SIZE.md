# Bundle size

Goal: less than 500 KB of client JavaScript, gzipped, so the app loads on a phone connection.

## Measure it

```bash
npm run build
npm run check:bundle                 # fails above 500 KB
npm run check:bundle -- --budget=450 # a different budget, in KB
```

`scripts/check-bundle-size.mjs` adds up the gzipped size of every file in `.next/static/chunks`, which is the
most a visitor downloads (the chunks of every route together), and lists the ten largest.

## What keeps it small

| Measure | Where |
|---|---|
| Each route is its own chunk | Next.js App Router, nothing to configure |
| The PDF library (`jspdf`) loads only when a certificate is exported | `import('@/lib/certificate')` in `src/app/will/[id]/page.tsx` |
| The QR library (`qrcode`) loads when the share panel mounts | `src/components/ShareVerification.tsx` |
| The batch top-up panel loads when multi-select is first used | `next/dynamic` in `src/app/dashboard/page.tsx` |
| Only the used parts of `@sorowill/sdk` and `next-intl` are included | `experimental.optimizePackageImports` in `next.config.mjs` |
| `console.log`, `info` and `debug` calls are removed from production code | `compiler.removeConsole` in `next.config.mjs` |
| CSS is minified, and Tailwind emits only the classes the code uses | Next.js production build |

## Dependencies

Every runtime dependency in `package.json` is imported: `viem` only by the reminder API route (server side, so not
in the client bundle), the rest by the app. A new dependency should be checked with `npm run check:bundle` before it
is merged.
