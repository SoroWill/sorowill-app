# Testing Map & Architecture

This document provides a consolidated map of all test suites, frameworks, and verification layers across the `sorowill-app` codebase.

## Overview of Test Layers

| Test Layer | Framework / Tool | Command | Scope / Purpose | Location |
|---|---|---|---|---|
| **Typecheck** | TypeScript (`tsc --noEmit`) | `npm run typecheck` | Static type safety and contract interface conformance across all code and tests. | `tsconfig.json` |
| **Lint** | ESLint + Next.js config | `npm run lint` | Code style, React hooks rules, and Next.js best practices. | `eslint.config.mjs`, `src/` |
| **Unit & Component Tests** | Vitest + React Testing Library | `npm run test` / `npm run test:unit` | Component behavior, state machines, deadline calculations, sanitization, formatters, and mocked contract interactions. | `tests/unit/`, `src/**/*.test.ts*` |
| **Contract Smoke Tests** | Vitest | `npx vitest run tests/unit/contract-smoke.test.ts` | Validates mocked SDK contract methods and error mappings against expected Soroban types. | `tests/unit/contract-smoke.test.ts` |
| **Reminder Dispatch Auth Tests** | Vitest | `npm run test:reminders` (also part of `npm run test`) | Validates that the reminders dispatch route fails closed without `CRON_SECRET` and rejects a mismatched bearer token. | `src/lib/reminders.test.ts` |
| **Component Stories & Visuals** | Storybook | `npm run build-storybook` | Isolated UI component rendering and visual states (BeneficiaryForm, CountdownTimer, GuardianPanel, StatusBanner, WillCard). | `src/components/*.stories.tsx` |
| **End-to-End (E2E) & Visual Regression** | Playwright (running against production build) | `npm run test:e2e` | Browser-level page flows, navigation, modal confirmations, and screenshot regression tests. | `tests/e2e/`, `playwright.config.ts` |
| **Accessibility (a11y)** | Playwright + Axe Core | `npm run test:a11y` | WCAG 2.1 AA compliance audit on all rendered pages and interactives. | `tests/e2e/accessibility.spec.ts` |

## Single Test Runner Policy

- **Vitest** is the sole unit test runner (removing fragmented Jest configurations). All unit and component tests are located under `tests/unit/` or alongside source files in `src/`. There is no Jest runner: `src/__tests__/` is not a test location, so new tests belong in `tests/unit/` (or next to the source file) where `vitest.config.ts` picks them up.
- **Playwright** is the sole E2E and visual testing tool, configured to run against the production build server (`npm run start`).
- **Storybook** stories are validated during CI builds (`npm run build-storybook`).
- **Reminders** are verified with `npm run test:reminders` (a Vitest run of `src/lib/reminders.test.ts`, also picked up by `npm run test`).
- **Exclusions**: `vitest.config.ts` excludes only `tests/e2e/**` (Playwright specs, which need a browser). No unit test file is excluded.
