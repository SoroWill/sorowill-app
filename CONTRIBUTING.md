# Contributing to sorowill-app

This repo participates in the **Stellar Wave Program** on [Drips](https://drips.network/wave). Contribution work is tied to issues that maintainers tag for an active Wave, and contributors earn rewards proportional to the Points assigned to the issues they resolve.

## Ground rules

- **Do not start work on any issue until you have been assigned by the maintainer.** Applying to an issue does not mean you're assigned — wait for confirmation (via the Drips Wave dashboard or a direct assignment on GitHub) before opening a PR.
- Keep PRs scoped to the issue they resolve. Unrelated changes slow down review and can cost you the Wave window.
- Be responsive during an active Wave — issues must be resolved before the Wave ends for Points to be awarded.

## Branch naming

Use the issue number in your branch name:

```
feat/N-short-description
fix/N-short-description
```

## Pull requests

- Your PR description must reference the issue it resolves (e.g. `Closes #7`).
- Make sure the full CI-equivalent checklist passes cleanly before requesting review.
- Test the affected page in a real browser with Freighter installed where the change touches wallet or transaction flows.
- Keep the dark purple theme (`will-purple`, `will-dark`, `will-light`) consistent with the rest of the app.

### Wave PR checklist

Before opening a PR for a Wave issue, verify all of the following:

- [ ] Assigned to the issue by maintainer before starting work
- [ ] PR branch name matches `feat/N-...` or `fix/N-...` format
- [ ] PR description references the resolved issue (`Closes #N`)
- [ ] `npm audit --audit-level=high` passes
- [ ] `npm run typecheck` passes with zero TypeScript errors
- [ ] `npm run lint` passes with zero ESLint errors
- [ ] `npm run build` succeeds cleanly
- [ ] `npm test` passes all Vitest test suites (unit tests live in `tests/unit/` or next to the source file; `src/__tests__/` is not collected by any runner)
- [ ] `npm run build-storybook` succeeds
- [ ] `npx vitest run tests/unit/contract-smoke.test.ts --reporter=verbose` passes
- [ ] `npm run test:e2e` and `npm run test:a11y` pass locally; CI also runs the Playwright suite against a production build
- [ ] Tested UI flow in browser with Freighter wallet (where applicable)
- [ ] Uses designated brand design tokens (`will-purple`, `will-dark`, `will-light`)

## Before opening a PR

Run these steps locally in order. Together they cover the checks in `.github/workflows/test.yml` (the e2e job installs browsers in CI):

```bash
# 1. Dependency audit
npm audit --audit-level=high

# 2. Type-check — catch TypeScript errors before CI does
npm run typecheck

# 3. Lint — ESLint must report zero errors
npm run lint

# 4. Build — the production Next.js build must succeed
npm run build

# 5. Unit tests — all Vitest tests must pass
npm run test

# 6. Storybook and contract smoke coverage
npm run build-storybook
npx vitest run tests/unit/contract-smoke.test.ts --reporter=verbose

# 7. Browser tests (also run by CI's e2e job)
npm run test:e2e
npm run test:a11y
```

> **All checks must pass with zero errors before you open a PR.** A PR that fails any of these steps will not be merged and may lose its Wave window.

## Design tokens

The app uses a compact palette of custom color tokens defined in `tailwind.config.ts`. Use these instead of hardcoded hex values so the theme stays consistent across every view:

| Token          | Hex       | Intended usage                                         |
|----------------|-----------|--------------------------------------------------------|
| `will-purple`  | `#4F46E5` | Primary action color — buttons, links, active states, progress bars |
| `will-dark`    | `#1E1B4B` | Page & header backgrounds (the deep purple brand base) |
| `will-light`   | `#EEF2FF` | Primary text color — headings, body copy, form labels  |

Opacity modifiers (e.g. `text-will-light/60`) are used for secondary/de-emphasised text; borders and dividers use `border-white/10` or `border-white/20` throughout.

## Environment variables: public-by-design

All three `NEXT_PUBLIC_*` variables that this app reads (`NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_CONTRACT_ID`, `NEXT_PUBLIC_RPC_URL`) are **intentionally public** — they describe the on-chain environment, not a secret. This is correct, because Next.js bundles every `NEXT_PUBLIC_*` variable into the client-side JavaScript sent to the browser.

⚠️ **Never prefix a genuinely sensitive value with `NEXT_PUBLIC_`.** If the app ever needs a server-side secret (an API key, a paid RPC provider auth token, a webhook signing secret, etc.), store it in a plain (non-`NEXT_PUBLIC_`) environment variable and consume it only inside Route Handlers, Server Components, or `getServerSideProps` / server actions. Those values stay on the server and are never exposed to the browser.

## Local setup

See the [README](./README.md#local-setup) for installation and environment configuration.

## Learn more

Full details on how Wave Programs work — applying, Points, rewards, and payouts — are documented at <https://drips.network/wave>.
