'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';

import { fetchWithCsrf } from '@/lib/csrfClient';
import { formatError } from '@/lib/errors';
import { safeGetPublicKey, truncateAddress } from '@/lib/freighter';
import type { TwoFactorChannel } from '@/lib/twoFactor';

interface StatusPayload {
  enrolled: boolean;
  verified: boolean;
  pending: boolean;
  channel: TwoFactorChannel | null;
}

interface SetupPayload {
  ok: boolean;
  channel: TwoFactorChannel;
  secret?: string;
  otpauthUri?: string;
  recoveryCodes: string[];
  smsSent?: boolean;
  smsConfigured?: boolean;
  developmentCode?: string;
}

/**
 * Two-factor settings (issue #879).
 *
 * Enrollments are tied to the connected wallet address and kept in signed,
 * HttpOnly cookies, because the app has no server-side user store. The page
 * therefore explains that setup is per browser instead of pretending to sync
 * across devices.
 */
export default function SecuritySettingsPage() {
  const [owner, setOwner] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [channel, setChannel] = useState<TwoFactorChannel>('totp');
  const [phone, setPhone] = useState('');
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/2fa/status', { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) setStatus((await response.json()) as StatusPayload);
    } catch {
      // Status is informational; a failure just leaves the previous value.
    }
  }, []);

  useEffect(() => {
    void safeGetPublicKey().then(setOwner);
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!setup?.otpauthUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setup?.otpauthUri]);

  async function startSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSetup(null);
    setCode('');

    try {
      const response = await fetchWithCsrf('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, channel, ...(channel === 'sms' ? { phone: phone.trim() } : {}) }),
      });
      const payload = (await response.json()) as SetupPayload & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not start setup.');
      }
      setSetup(payload);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetchWithCsrf('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; remainingRecoveryCodes?: number };
      if (!response.ok || !payload.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'That code is not valid.');
      }
      setNotice('Two-factor authentication is now on for this browser.');
      setSetup(null);
      setCode('');
      await refreshStatus();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetchWithCsrf('/api/auth/2fa/disable', { method: 'POST' });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not disable two-factor.');
      }
      setNotice('Two-factor authentication has been turned off for this browser.');
      await refreshStatus();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Security</h1>
        <p className="mt-1 text-sm text-will-light/60">
          Add a second step when signing in to sensitive actions. Setup is per browser and tied to
          the wallet you connect here.
        </p>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-will-light/60">
          {!status
            ? 'Checking this browser…'
            : status.enrolled
              ? `On (${status.channel === 'sms' ? 'SMS' : 'authenticator app'}).`
              : 'Off for this browser.'}
        </p>
        {owner ? (
          <p className="mt-1 text-xs text-will-light/40">
            Wallet: <span className="font-mono">{truncateAddress(owner)}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-300">Connect your wallet to set up two-factor authentication.</p>
        )}

        {status?.enrolled ? (
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="mt-3 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70 disabled:opacity-60"
          >
            Turn off two-factor authentication
          </button>
        ) : null}
      </section>

      {!status?.enrolled && !setup ? (
        <form onSubmit={startSetup} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <fieldset>
            <legend className="text-sm font-semibold text-will-light">Choose a second factor</legend>
            <label className="mt-2 flex items-center gap-2 text-sm text-will-light/80">
              <input
                type="radio"
                name="channel"
                value="totp"
                checked={channel === 'totp'}
                onChange={() => setChannel('totp')}
              />
              Authenticator app (TOTP)
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-will-light/80">
              <input
                type="radio"
                name="channel"
                value="sms"
                checked={channel === 'sms'}
                onChange={() => setChannel('sms')}
              />
              SMS
            </label>
          </fieldset>

          {channel === 'sms' ? (
            <div>
              <label htmlFor="two-factor-phone" className="block text-sm text-will-light/80">
                Phone number
              </label>
              <input
                id="two-factor-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+15551234567"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
              />
              <p className="mt-1 text-xs text-will-light/40">Use international format, including the country code.</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy || !owner}
            className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Starting…' : 'Start setup'}
          </button>
        </form>
      ) : null}

      {setup ? (
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold text-will-light">
            {setup.channel === 'sms' ? 'Confirm your phone' : 'Scan this with your authenticator'}
          </h2>

          {setup.channel === 'totp' ? (
            <div className="space-y-3">
              {qrDataUrl ? (
                // The QR encodes the otpauth URI, which is generated server-side for this enrollment.
                <img src={qrDataUrl} alt="Two-factor authentication QR code" width={220} height={220} />
              ) : null}
              {setup.secret ? (
                <p className="break-all font-mono text-xs text-will-light/70">
                  Or enter this key manually: {setup.secret}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1 text-sm text-will-light/70">
              <p>
                {setup.smsSent
                  ? 'A six-digit code has been sent to your phone.'
                  : 'SMS delivery is not configured on this deployment.'}
              </p>
              {setup.developmentCode ? (
                <p className="text-xs text-amber-300">Development code: {setup.developmentCode}</p>
              ) : null}
            </div>
          )}

          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <h3 className="text-sm font-semibold text-amber-200">Save your recovery codes</h3>
            <p className="mt-1 text-xs text-amber-200/80">
              Each code works once if you lose access to your second factor. They are shown only now.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm text-will-light">
              {setup.recoveryCodes.map((recoveryCode) => (
                <li key={recoveryCode}>{recoveryCode}</li>
              ))}
            </ul>
          </div>

          <form onSubmit={confirmCode} className="space-y-2">
            <label htmlFor="two-factor-code" className="block text-sm text-will-light/80">
              Enter a code to finish
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="two-factor-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456 or K3M7-9QXA"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm tracking-widest text-will-light focus:border-will-purple focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || code.trim() === ''}
                className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60"
              >
                {busy ? 'Verifying…' : 'Verify code'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}

      <p className="text-xs text-will-light/40">
        Two-factor authentication protects actions taken in this browser. It is not a substitute for
        keeping your wallet&apos;s recovery phrase offline.
      </p>
    </div>
  );
}
