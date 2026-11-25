'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import {
  WILL_LOCK_CHANGED_EVENT,
  decryptWithPassword,
  isWillUnlocked,
  markWillUnlocked,
  readWillLock,
  willLockVerifier,
  type StoredWillLock,
} from '@/lib/willPassword';

type GateState = 'checking' | 'locked' | 'unlocked';

/**
 * Asks for the will's password before rendering the page content (issue #874).
 *
 * The lock lives in this browser's localStorage; a will without one renders
 * immediately. Once the right password is entered the unlock is remembered for
 * the tab, so navigating within the page does not re-prompt.
 */
export function WillPasswordGate({ willId, children }: { willId: string; children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [lock, setLock] = useState<StoredWillLock | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const sync = useCallback(() => {
    const stored = readWillLock(willId);
    setLock(stored);
    setState(!stored || isWillUnlocked(willId) ? 'unlocked' : 'locked');
  }, [willId]);

  useEffect(() => {
    sync();
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === willId) sync();
    };
    window.addEventListener(WILL_LOCK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(WILL_LOCK_CHANGED_EVENT, onChange);
  }, [sync, willId]);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lock || checking) return;

    setChecking(true);
    setError(null);
    try {
      const plaintext = await decryptWithPassword(lock.payload, password);
      if (plaintext !== willLockVerifier(willId)) {
        throw new Error('Incorrect password.');
      }
      markWillUnlocked(willId);
      setPassword('');
      setState('unlocked');
    } catch {
      setError('Incorrect password. Try again.');
    } finally {
      setChecking(false);
    }
  }

  if (state === 'checking') {
    return <div className="skeleton h-24 w-full rounded-xl" aria-label="Checking will protection" />;
  }

  if (state === 'unlocked') {
    return <>{children}</>;
  }

  return (
    <section
      aria-labelledby="will-lock-title"
      className="mx-auto max-w-md space-y-4 rounded-xl border border-white/10 bg-white/5 p-6"
    >
      <div className="space-y-1">
        <h2 id="will-lock-title" className="text-lg font-semibold text-will-light">
          🔒 This will is password-protected
        </h2>
        <p className="text-sm text-will-light/60">
          Enter the password set by the will&apos;s owner on this device to view it.
        </p>
        {lock?.hint ? (
          <p className="text-xs text-will-light/50">Hint: {lock.hint}</p>
        ) : null}
      </div>

      <form className="space-y-3" onSubmit={handleUnlock}>
        <label htmlFor="will-lock-password" className="block text-sm font-medium text-will-light">
          Password
        </label>
        <input
          id="will-lock-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'will-lock-error' : undefined}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
        />
        {error ? (
          <p id="will-lock-error" role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={checking || password === ''}
          className="w-full rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? 'Unlocking…' : 'Unlock will'}
        </button>
      </form>

      <p className="text-xs text-will-light/40">
        Forgot the password? The owner can remove the protection from this device, but the password
        itself cannot be recovered.
      </p>
    </section>
  );
}
