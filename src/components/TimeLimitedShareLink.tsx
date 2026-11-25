'use client';

import { useState } from 'react';
import { fetchWithCsrf } from '@/lib/csrfClient';

/** Lifetimes offered for a time-limited link (#875). Mirrors SHARE_LINK_TTL_HOURS. */
export const SHARE_TTL_OPTIONS: { hours: number; label: string }[] = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 30, label: '30 days' },
];

/** Will id from a verify page URL such as `/verify/12`, or null. */
export function willIdFromVerifyUrl(pageUrl: string): string | null {
  try {
    const parts = new URL(pageUrl).pathname.split('/').filter(Boolean);
    return parts[0] === 'verify' && parts[1] && /^\d+$/.test(parts[1]) ? parts[1] : null;
  } catch {
    return null;
  }
}

interface CreatedLink {
  url: string;
  expiresAt: string;
}

/** Creates an encrypted, read-only verify link that expires after the chosen time (#875). */
export function TimeLimitedShareLink({ pageUrl }: { pageUrl: string }) {
  const willId = willIdFromVerifyUrl(pageUrl);
  const [hours, setHours] = useState(SHARE_TTL_OPTIONS[1].hours);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!willId) return null;

  async function handleCreate() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const response = await fetchWithCsrf('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ willId, ttlHours: hours }),
      });
      const body = (await response.json()) as { ok: boolean; path?: string; expiresAt?: string; error?: string };
      if (!response.ok || !body.ok || !body.path || !body.expiresAt) {
        throw new Error(body.error || 'Could not create the link');
      }
      setCreated({ url: new URL(body.path, pageUrl).toString(), expiresAt: body.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the link');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError('Failed to copy link — please copy it manually.');
    }
  }

  return (
    <div className="w-full border-t border-white/10 pt-4 text-left" data-testid="time-limited-share">
      <h4 className="text-xs font-semibold text-will-light">Time-limited link</h4>
      <p className="mt-1 text-xs text-will-light/60">
        A read-only, encrypted link that stops working after the time you choose.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-xs text-will-light/80" htmlFor="share-ttl">
          Expires after
        </label>
        <select
          id="share-ttl"
          value={hours}
          onChange={(event) => setHours(Number(event.target.value))}
          className="rounded-lg border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light"
        >
          {SHARE_TTL_OPTIONS.map((option) => (
            <option key={option.hours} value={option.hours}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="rounded-full bg-will-purple px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-will-purple/90 disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create link'}
        </button>
      </div>
      {created ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            readOnly
            aria-label="Time-limited link"
            value={created.url}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-will-light/80 outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-will-light/80 transition hover:border-white/40"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : null}
      {created ? (
        <p className="mt-1 text-xs text-will-light/60">
          Expires {new Date(created.expiresAt).toUTCString()}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
