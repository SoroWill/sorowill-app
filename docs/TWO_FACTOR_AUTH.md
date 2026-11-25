# Two-factor authentication

Optional TOTP or SMS second factor for a connected Stellar wallet (issue #879).

## Design

The app has no user database: identity is the connected wallet. An enrollment
is therefore kept in signed, `HttpOnly` cookies rather than a server-side
session store. The browser can hold the cookies but neither read nor alter them.

| Cookie | Lifetime | Purpose |
| --- | --- | --- |
| `sorowill_2fa_enrollment` | 10 minutes | Pending enrollment: TOTP secret, or the SHA-256 hash of the pending SMS code. |
| `sorowill_2fa_verified` | 30 minutes | This browser passed a code check recently. |
| `sorowill_2fa_enrolled` | 30 days | This browser has a completed enrollment (channel and owner). |

Enrollment and verification endpoints:

- `POST /api/auth/2fa/setup` — `{ owner, channel: "totp" | "sms", phone? }`.
  Returns the `otpauth://` URI and secret for authenticator apps, or sends an
  SMS code. Recovery codes are returned **once** here; only hashes are kept.
- `POST /api/auth/2fa/verify` — `{ code }`, a six-digit code or a recovery code
  such as `K3M7-9QXA`. A used recovery code is removed from the enrollment.
- `GET /api/auth/2fa/status` — enrollment/verification state for this browser.
- `POST /api/auth/2fa/disable` — clears all three cookies. Requires a recent
  verification in this browser, so a stolen CSRF token alone cannot disable it.

All mutating routes require a CSRF token and are rate limited.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `TWO_FACTOR_SECRET` | In production | HMAC key for the cookies. Generate with `openssl rand -hex 32`. `SESSION_SECRET` is used as a fallback. |
| `SENT_API_KEY` | For SMS | [Sent](https://sent.dm) API key. Server-only. |
| `SENT_PROJECT_ID` | For SMS | Sent project ID. Server-only. |

Without `TWO_FACTOR_SECRET`, production requests fail with a configuration
error. Development uses a fixed, logged development key so local setup works.

Without Sent credentials, SMS setup in development logs the code and returns it
as `developmentCode`; in production it fails with `502` rather than pretending
the message was sent. TOTP needs no external service.

## UI

`/settings/security` (`src/app/settings/security/page.tsx`) shows the current
state, starts TOTP or SMS enrollment, renders the TOTP QR code, verifies a code
and lists recovery codes once.

## Limitations

- **Per browser, not per account.** Cookies are tied to the browser profile.
  Enrolling on one device does not protect the wallet on another, and clearing
  cookies removes the enrollment.
- **Not yet enforced on will operations.** The enrollment and verification
  flow, cookies and status are implemented, but sensitive actions (check-in,
  trigger, top-up, beneficiary changes) do not yet require the verified cookie.
  Wiring enforcement into those routes is the remaining part of #879.
- **No SMS delivery receipts.** A `200` from Sent means the message was
  accepted, not that it reached the handset.
- **UI copy is currently English-only.**
