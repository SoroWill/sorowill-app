# Password-protected wills

Optional, per-device password protection for the will view (issue #874).

## What this protects

A will's on-chain record is public: owner, balance, beneficiary addresses and
check-in state can be read from Stellar by anyone. This feature protects the
**local copy shown in the app**, so a will left open on a shared or unattended
device does not expose its details to the next person who picks it up.

It is a view lock, not on-chain encryption. Anyone with the will ID can still
read the on-chain data through another client or a block explorer.

## How it works

Enabling protection on a will:

1. Derives an AES-256-GCM key from the password with PBKDF2-SHA256
   (210,000 iterations, 16-byte random salt).
2. Encrypts a short verifier string (`sorowill-will-lock:<willId>`) with a
   random 12-byte IV.
3. Stores only the salt, IV and ciphertext, plus an optional hint and creation
   timestamp, under `sorowill-will-lock-<willId>` in `localStorage`.

Nothing derived from the password is stored, so a copy of `localStorage` cannot
be decrypted without guessing the password. A wrong password and a tampered
payload are indistinguishable: AES-GCM authentication fails for both.

The will page renders `WillPasswordGate`. With no lock present it renders
immediately. With a lock it prompts for the password, decrypts the verifier and
compares it to the will ID. A successful unlock is remembered in
`sessionStorage` (`sorowill-will-unlocked-<willId>`) for that tab only.

The owner controls (`WillPasswordPanel`) can set, change or remove the lock.
Removal requires the current password, and forgetting it means the lock can only
be cleared by deleting the site's local storage.

## Threat model and limitations

- **Protects:** someone opening the site on the same device without the
  password, including a shared computer or a borrowed unlocked phone.
- **Does not protect:** the public on-chain record, screenshots or data already
  rendered before locking, a compromised browser/XSS, or an attacker with
  access to the unlocked tab's `sessionStorage`.
- **Per device and per browser profile.** The lock does not sync, because the
  app has no user database; enabling it on one device does not protect another.
- **No recovery.** The password is never sent anywhere, so a lost password
  cannot be reset. The UI states this.
- **UI copy is currently English-only.** The feature does not yet use
  next-intl messages.

## Implementation

- `src/lib/willPassword.ts` — policy, PBKDF2/AES-GCM helpers, lock storage.
- `src/components/WillPasswordGate.tsx` — unlock prompt around the page.
- `src/components/WillPasswordPanel.tsx` — owner enable/remove controls.
- `tests/unit/willPassword.test.ts`, `tests/unit/WillPasswordGate.test.tsx`.
