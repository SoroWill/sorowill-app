<img src="./docs/logo.svg" alt="SoroWill" width="56" height="56" />

# SoroWill App

**On-chain inheritance, in your browser**

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-08b5e5?logo=stellar)](https://developers.stellar.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Live app: [sorowill.vercel.app](https://sorowill.vercel.app/)**

![SoroWill landing page](./docs/screenshot.png)

## What is SoroWill

SoroWill is a trustless, on-chain inheritance protocol on Stellar Soroban. This app is the dashboard for it: create a will, check in to prove you're active, review beneficiaries and guardians, and — for anyone named as a beneficiary — verify and claim an inheritance once a will's grace period has elapsed.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS 3**
- **[@sorowill/sdk](../sorowill-sdk)** for all contract interaction and Freighter wallet handling

> **Wallet support:** This app currently only supports the **[Freighter](https://freighter.app/)** browser extension. Other Stellar wallets (Albedo, xBull, Rabet, …) are not yet supported — you will not be able to connect them. Multi-wallet support is tracked in the SDK's wallet-adapter work; see the [`@sorowill/sdk`](https://www.npmjs.com/package/@sorowill/sdk) package for progress.

## Local Setup

```bash
git clone https://github.com/SoroWill/sorowill-app.git
cd sorowill-app
# The .nvmrc file pins Node 20 (matching CI). If you use nvm/fnm/volta, run:
#   nvm use       (nvm)
#   fnm use        (fnm)
#   volta install  (volta)
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_CONTRACT_ID with your deployed SoroWill contract address
npm run dev
```

> This app depends on [`@sorowill/sdk`](https://www.npmjs.com/package/@sorowill/sdk), published to npm under the `sorowill` org.

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | Stellar network to connect to: `testnet` or `mainnet` |
| `NEXT_PUBLIC_CONTRACT_ID` | Address of the deployed SoroWill contract |
| `NEXT_PUBLIC_RPC_URL` | Soroban RPC endpoint (defaults to the public testnet RPC) |
| `RESEND_API_KEY` | API key for reminder emails (optional; leave unset to skip sending) |
| `RESEND_FROM_EMAIL` | Verified Resend sender address used for reminder emails |
| `KV_REST_API_URL` | Vercel KV / Upstash Redis REST URL used to persist reminder subscriptions (required for reminders; the serverless filesystem is ephemeral) |
| `KV_REST_API_TOKEN` | REST token for the KV store above |
| `REMINDER_STORE_KV_KEY` | Optional key used to store the reminder blob in the KV store (defaults to `sorowill:reminder-store`) |
| `CRON_SECRET` | Bearer token for authenticating automated reminder dispatch requests from GitHub Actions (required if using the automated GitHub Actions trigger; see [Reminder delivery](#reminder-delivery)) |
| `NEXT_PUBLIC_APP_URL` | Optional public base URL used to build the unsubscribe link in reminder emails (defaults to `VERCEL_URL` or `http://localhost:3000`) |

## Pages

| Route | Description |
|---|---|
| `/` | Landing page explaining SoroWill |
| `/dashboard` | Your wills (owned and inherited), with quick check-in |
| `/will/new` | Multi-step form to create a new will |
| `/will/[id]` | Full will detail: check in, top up, update beneficiaries, cancel, trigger, release |
| `/inherit/[id]` | Beneficiary view — see your entitled share and claim once ready |
| `/verify/[id]` | Public, wallet-free verification of a will's on-chain state |

## Internationalization

This app uses **[next-intl](https://next-intl-docs.vercel.app/)** for translation strings. Translation namespaces and strings are stored in `src/messages/en.json`, which is organized by feature:

- **`common`** — reusable UI strings (buttons, labels, form text)
- **`landing`** — landing page (`/`)
- **`dashboard`** — dashboard page (`/dashboard`)
- **`willDetail`** — will detail view (`/will/[id]`)
- **`status`** — will status labels and descriptions
- **`inherit`** — beneficiary inheritance view (`/inherit/[id]`)

To use translations in a component:
- **Server components:** `import { getTranslations } from 'next-intl/server'; const t = await getTranslations('namespace');` then use `t('key')`
- **Client components:** `import { useTranslations } from 'next-intl'; const t = useTranslations('namespace');` then use `t('key')`

Currently, the app only supports `en` (English), hardcoded in `src/i18n/request.ts`. Contributors adding new UI copy should place translatable strings in `src/messages/en.json` under the appropriate namespace rather than hardcoding them. Multi-locale support (switching from `'en'` to dynamic locale detection) is tracked separately but not yet implemented.

## Reminder delivery

Reminders are delivered by a server-side route that can be triggered on a schedule. The app ships a lightweight JSON store for subscriptions and dispatch history, so a daily cron job can call the dispatch endpoint without exposing any secrets.

The dispatch route (`/api/reminders/dispatch`) computes reminder windows from each will's `lastCheckin` and `checkinPeriodDays`, sending a well-before reminder once and an imminent reminder once for each active will that still has time left. The route is protected by a `CRON_SECRET` bearer token when configured.

### Automated Reminder Triggers

The application supports the following automated trigger mechanisms to schedule daily reminder dispatch:

#### GitHub Actions Workflow (Recommended)

**File:** `.github/workflows/reminder-cron.yml`

The primary automated trigger runs via GitHub Actions, scheduled daily at `08:00 UTC` (cron: `0 8 * * *`). The workflow:
- Runs on a fixed schedule every day
- Supports manual re-runs via the GitHub UI (`workflow_dispatch`)
- Keeps per-run logs for debugging and monitoring
- Fails visibly if the dispatch endpoint returns a non-2xx response

**Required GitHub Actions Secrets:**

To enable reminder delivery via GitHub Actions, set the following **repository secrets** (not to be confused with environment variables):

1. **`REMINDER_DISPATCH_URL`** — The full URL to your `/api/reminders/dispatch` endpoint
   - Example: `https://sorowill.vercel.app/api/reminders/dispatch`
   - For local/private deployments, use your deployment's public URL

2. **`CRON_SECRET`** — A secure bearer token that authenticates cron requests to the dispatch endpoint
   - This token is passed in the `Authorization: Bearer` header
   - Can be any arbitrary string; treat it as a password
   - The API route validates this against the `CRON_SECRET` environment variable

**Configuration Steps:**

1. Go to your GitHub repository settings → Secrets and variables → Actions
2. Create a **New repository secret**:
   - Name: `REMINDER_DISPATCH_URL`
   - Value: Your app's dispatch endpoint URL (e.g., `https://your-deployment.vercel.app/api/reminders/dispatch`)
3. Create another **New repository secret**:
   - Name: `CRON_SECRET`
   - Value: A random string to serve as the bearer token (e.g., generate with `openssl rand -hex 32`)
4. Ensure your deployment has the corresponding `CRON_SECRET` environment variable set (see [Environment Variables](#environment-variables))

#### Manual Dispatch

For testing or one-off dispatch, you can manually call the endpoint with `curl`:

```bash
curl --fail -X POST https://your-app.example.com/api/reminders/dispatch \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Scheduling Notes

- **Single Scheduler:** `.github/workflows/reminder-cron.yml` is the **only** scheduled trigger. A previous Vercel Cron entry that fired on the same schedule has been removed to avoid duplicate dispatch runs.
- **No Duplicate Triggers:** Do not add a second independent scheduler unless absolutely necessary; doing so causes the dispatch route to run multiple times in quick succession. If a backup scheduler is needed, give it a distinctly different schedule (e.g., a different hour) and document the intent here.
- **Race Condition Mitigation:** The dispatch route records `wellBeforeSentAt` and `imminentSentAt` timestamps per will in the KV store immediately after each send. Subscriptions with a recorded timestamp of that kind are skipped. This prevents duplicate reminders even if two dispatch runs overlap, though the lack of locking means a true race condition is still theoretically possible—yet another reason to keep a single scheduler.
- **Error Visibility:** GitHub Actions fails the run when the dispatch endpoint returns a non-2xx response, making broken dispatch immediately visible in the Actions UI.

## Contributing via Drips Wave

This repo participates in the **Stellar Wave Program** on [Drips](https://drips.network/wave). Maintainer-tagged issues carry Point values, and contributors who resolve them during an active Wave earn a proportional share of that Wave's reward pool. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow, and <https://drips.network/wave> for how Wave itself works.
