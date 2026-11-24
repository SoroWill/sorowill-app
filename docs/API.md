# API reference

The HTTP endpoints of the app are described by an OpenAPI 3 file, [`openapi.json`](./openapi.json). It is
generated from the code, so it cannot drift from the routes: change a route, regenerate, commit both.

## How it is generated

Each route handler in `src/app/api/**/route.ts` has a JSDoc block that starts with `@openapi` and the HTTP
method, followed by an OpenAPI operation object written as JSON:

```ts
/**
 * @openapi GET
 * {
 *   "summary": "Server time",
 *   "responses": {
 *     "200": {
 *       "description": "The current server time.",
 *       "content": { "application/json": { "example": { "now": 1767225600000 } } }
 *     }
 *   }
 * }
 */
export function GET() { ... }
```

The path is taken from the route's folder (`src/app/api/reminders/register/route.ts` is
`/api/reminders/register`, and `[id]` becomes `{id}`), so it never has to be written by hand.

```bash
npm run generate:openapi   # rewrite docs/openapi.json
npm run check:openapi      # fail when docs/openapi.json is out of date (also runs in CI)
```

The generator, `scripts/generate-openapi.mjs`, has no dependencies, which is why the comments hold JSON and
not YAML. Shared pieces (the `Error` schema and the `cronBearer` security scheme) live in the generator.

## Every operation documents

- what it does and who may call it,
- its parameters or request body, with an example,
- each response it can return (success and errors) with an example body.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/time` | Server time in epoch milliseconds |
| POST | `/api/reminders/register` | Subscribe an email to check-in reminders (signed, rate limited) |
| GET | `/api/reminders/confirm` | Confirm a subscription from the email link |
| GET, POST | `/api/reminders/unsubscribe` | Unsubscribe from the email link or with one click |
| GET, POST | `/api/reminders/dispatch` | Send due reminders (needs `CRON_SECRET`) |
| POST | `/api/oauth/token` | Exchange integration client credentials for an access token |
| GET | `/api/public/v1/status` | Public API status (needs an OAuth access token) |

## Third-party integrations

Integrations authenticate with the OAuth 2.0 client-credentials grant:

1. Ask a maintainer for a client id and secret. They are configured server-side in
   `OAUTH_CLIENTS` as comma-separated `clientId:clientSecret` pairs; `OAUTH_TOKEN_SECRET` is the
   HMAC key for access tokens (when unset, a random per-process key is used and tokens do not
   survive a restart). Neither value is ever exposed to the browser.
2. `POST /api/oauth/token` with `grant_type=client_credentials` and the credentials as HTTP Basic
   auth or as `client_id`/`client_secret` form fields. The response holds `access_token`,
   `token_type` (`Bearer`) and `expires_in` (3600 seconds).
3. Send `Authorization: Bearer <access_token>` to the public API. An invalid or expired token
   answers `401 invalid_token`; request a new one.

Rate limits are fixed windows, per client (per IP for token requests), and every limited response
carries `Retry-After`:

| Endpoint | Limit |
|---|---|
| `POST /api/oauth/token` | 20 requests per hour per IP |
| `GET /api/public/v1/status` | 120 requests per minute per client |

The public API answers with `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers.

## Adding a route

1. Add the `@openapi` block above the handler.
2. Run `npm run generate:openapi`.
3. Commit the route and `docs/openapi.json` together.
