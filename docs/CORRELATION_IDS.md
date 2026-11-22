# API correlation IDs

Every response from an API route under `src/app/api` carries an `X-Correlation-ID` header, and the
server logs each request with the same id. When an error is reported, ask for that id and search the
logs for it.

## How it works

- A route handler is wrapped with `withCorrelationId` from `src/lib/correlation.ts`.
- The id is a new UUID for each request. If the request has an `X-Correlation-ID` header with 8 to 64
  letters, digits, `-` or `_`, that value is used instead, so a client or proxy can follow a request
  across systems. Any other value is ignored and a UUID is generated.
- The id is added to the response headers, for success and error responses alike.
- Each request is logged once when it finishes:

  ```
  [api] POST /api/reminders/register -> 200 in 14ms correlationId=3f0c1a52-...
  ```

- An error that a handler does not catch is logged with the same id and answered with a 500:

  ```json
  { "ok": false, "error": "Internal server error", "correlationId": "3f0c1a52-..." }
  ```

## Adding it to a new route

```ts
import { withCorrelationId } from '@/lib/correlation';

async function handleGET(request: Request) {
  return Response.json({ ok: true });
}

export const GET = withCorrelationId(handleGET);
```

## Routes covered

| Route | Methods |
|---|---|
| `/api/time` | GET |
| `/api/reminders/register` | POST |
| `/api/reminders/confirm` | GET |
| `/api/reminders/unsubscribe` | GET, POST |
| `/api/reminders/dispatch` | GET, POST |
