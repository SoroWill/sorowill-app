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

Reminders are delivered by a server-side route that can be triggered on a schedule. The app ships a lightweight JSON store for subscriptions and dispatch history, so a daily cron job can call the dispatch endpoint without exposing any secrets:

```bash
curl --fail -X POST https://your-app.example.com/api/reminders/dispatch
```

The dispatch route computes reminder windows from each will's `lastCheckin` and `checkinPeriodDays`, sending a well-before reminder once and an imminent reminder once for each active will that still has time left. The route is protected by a `CRON_SECRET` bearer token when configured.

### Scheduling

`.github/workflows/reminder-cron.yml` is the single scheduled trigger for `/api/reminders/dispatch`, running daily at `0 8 * * *`. It is deliberately the only one: a Vercel Cron entry previously fired the same endpoint on the same schedule, so the route ran twice back to back every day from two uncoordinated triggers. The Vercel Cron entry has been removed. Do not add a second scheduler; if one is ever needed as a backup, give it a staggered schedule and note the intent here.

GitHub Actions is the chosen home because it keeps per-run logs, supports a manual `workflow_dispatch` re-run, and fails the run on a non-2xx response so a broken dispatch is visible.

Duplicate triggers are harmless in the sequential case regardless: `dispatchReminderEmails` records a `wellBeforeSentAt` / `imminentSentAt` timestamp per will and email in the shared store immediately after each send, and skips any subscription whose reminder of that kind is already recorded. That check is a read-modify-write against the KV store with no locking, so two genuinely concurrent runs can still race, which is a further reason to keep exactly one scheduler.

## Contributing via Drips Wave

This repo participates in the **Stellar Wave Program** on [Drips](https://drips.network/wave). Maintainer-tagged issues carry Point values, and contributors who resolve them during an active Wave earn a proportional share of that Wave's reward pool. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow, and <https://drips.network/wave> for how Wave itself works.
