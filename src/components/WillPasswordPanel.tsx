'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  WILL_LOCK_CHANGED_EVENT,
  WILL_PASSWORD_MIN_LENGTH,
  clearWillLock,
  createWillLock,
  decryptWithPassword,
  getPasswordProblem,
  readWillLock,
  willLockVerifier,
  type StoredWillLock,
} from '@/lib/willPassword';

/**
 * Owner controls for password-protecting a will's view (issue #874).
 *
 * Protection is per device: it encrypts the will's local view lock with a
 * password and keeps only the ciphertext in localStorage. The on-chain record
 * is unaffected (and remains public), which the copy states plainly so the
 * feature is not mistaken for on-chain encryption.
 */
export function WillPasswordPanel({ willId }: { willId: string }) {
  const [lock, setLock] = useState<StoredWillLock | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [hint, setHint] = useState('');
  const [removalPassword, setRemovalPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => setLock(readWillLock(willId)), [willId]);

  useEffect(() => {
    sync();
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === willId) sync();
    };
    window.addEventListener(WILL_LOCK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(WILL_LOCK_CHANGED_EVENT, onChange);
  }, [sync, willId]);

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const problem = getPasswordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await createWillLock(willId, password, hint);
      setPassword('');
      setConfirmation('');
      setHint('');
      setStatus('Password protection enabled for this device.');
      sync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable password protection.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lock) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const plaintext = await decryptWithPassword(lock.payload, removalPassword);
      if (plaintext !== willLockVerifier(willId)) {
        throw new Error('Incorrect password.');
      }
      clearWillLock(willId);
      setRemovalPassword('');
      setStatus('Password protection removed from this device.');
      sync();
    } catch {
      setError('Incorrect password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="will-password-panel-title"
      className="print-hide space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"
    >
      <div>
        <h2 id="will-password-panel-title" className="text-sm font-semibold text-will-light">
          Password protection
        </h2>
        <p className="mt-1 text-sm text-will-light/60">
          Require a password before this will&apos;s details are shown on this device. The
          encryption happens in your browser; the on-chain record stays public.
        </p>
      </div>

      {lock ? (
        <form className="space-y-2" onSubmit={handleRemove}>
          <p className="text-sm text-emerald-300">
            Protected on this device since {new Date(lock.createdAt).toLocaleDateString()}.
          </p>
          {lock.hint ? <p className="text-xs text-will-light/50">Hint: {lock.hint}</p> : null}
          <label htmlFor="will-lock-remove" className="block text-sm text-will-light/80">
            Enter the password to remove protection
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="will-lock-remove"
              type="password"
              value={removalPassword}
              onChange={(event) => setRemovalPassword(event.target.value)}
              autoComplete="current-password"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || removalPassword === ''}
              className="rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove protection
            </button>
          </div>
        </form>
      ) : (
        <form className="space-y-2" onSubmit={handleEnable}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="will-lock-new" className="block text-sm text-will-light/80">
                New password
              </label>
              <input
                id="will-lock-new"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={WILL_PASSWORD_MIN_LENGTH}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="will-lock-confirm" className="block text-sm text-will-light/80">
                Confirm password
              </label>
              <input
                id="will-lock-confirm"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="will-lock-hint" className="block text-sm text-will-light/80">
              Hint (optional, shown on the unlock screen)
            </label>
            <input
              id="will-lock-hint"
              type="text"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60"
          >
            {busy ? 'Encrypting…' : 'Enable password protection'}
          </button>
          <p className="text-xs text-will-light/40">
            At least {WILL_PASSWORD_MIN_LENGTH} characters. The password cannot be recovered, so store
            it somewhere safe.
          </p>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-emerald-300">
          {status}
        </p>
      ) : null}
    </section>
  );
}
