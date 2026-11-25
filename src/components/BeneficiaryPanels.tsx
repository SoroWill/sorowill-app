'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationFrequency,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';
import { verifyBeneficiaryAccount, type VerificationCheck } from '@/lib/beneficiaryVerification';

const STATUS_ICON: Record<VerificationCheck['status'], string> = { ok: '✓', warn: '!', fail: '✗' };
const STATUS_CLASS: Record<VerificationCheck['status'], string> = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  fail: 'text-red-300',
};

/** Pre-claim checks that the beneficiary's account can receive its share (#889). */
export function BeneficiaryAccountCheck({
  address,
  amountUsdc,
  verify = verifyBeneficiaryAccount,
}: {
  address: string;
  amountUsdc: number;
  verify?: typeof verifyBeneficiaryAccount;
}) {
  const [checks, setChecks] = useState<VerificationCheck[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setChecks(null);
    setError('');
    verify(address, amountUsdc, { signal: controller.signal })
      .then(setChecks)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not check the account');
      });
    return () => controller.abort();
  }, [address, amountUsdc, verify]);

  const problems = checks?.filter((c) => c.status !== 'ok') ?? [];

  return (
    <section aria-label="Can this account receive the funds?" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
      <h2 className="text-sm font-semibold text-will-light">Can your account receive the funds?</h2>
      {error ? (
        <p role="alert" className="text-xs text-red-300">Could not check the account: {error}</p>
      ) : !checks ? (
        <p className="text-xs text-will-light/60">Checking your account…</p>
      ) : (
        <>
          {problems.length > 0 ? (
            <p role="alert" className="text-xs text-amber-200">
              {problems.some((p) => p.status === 'fail')
                ? 'Your account may not be able to receive this amount. Fix the items below before claiming.'
                : 'Your account can receive this amount, but check the notes below.'}
            </p>
          ) : (
            <p className="text-xs text-emerald-300">Your account is ready to receive this amount.</p>
          )}
          <ul className="space-y-1">
            {checks.map((check) => (
              <li key={check.id} className="text-xs" data-status={check.status}>
                <span className={`mr-1 font-bold ${STATUS_CLASS[check.status]}`} aria-hidden="true">
                  {STATUS_ICON[check.status]}
                </span>
                <span className="font-medium text-will-light">{check.label}</span>
                <span className="text-will-light/60"> — {check.detail}</span>
                {check.suggestion ? <span className="block pl-4 text-will-light/80">Suggestion: {check.suggestion}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const FREQUENCY_LABELS: Record<NotificationFrequency, string> = {
  immediate: 'As it happens',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
};

/** Beneficiary opt-in, frequency, events and delivery methods (#886). */
export function BeneficiaryNotificationPrefs({ wallet, willId }: { wallet: string; willId: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPrefs(loadNotificationPrefs(wallet, willId)), [wallet, willId]);

  const update = (patch: Partial<NotificationPrefs>) => {
    setSaved(false);
    setPrefs((current) => ({ ...current, ...patch }));
  };

  function handleSave() {
    const problems = saveNotificationPrefs(wallet, willId, prefs);
    setErrors(problems);
    setSaved(problems.length === 0);
  }

  return (
    <section aria-label="Notification preferences" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-will-light">Notifications about this will</h2>
      <label className="flex items-center gap-2 text-xs text-will-light">
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        Notify me about this will
      </label>

      {prefs.enabled ? (
        <>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-will-light/80">How often</legend>
            {(Object.keys(FREQUENCY_LABELS) as NotificationFrequency[]).map((frequency) => (
              <label key={frequency} className="mr-3 inline-flex items-center gap-1 text-xs text-will-light/80">
                <input
                  type="radio"
                  name={`notify-frequency-${willId}`}
                  value={frequency}
                  checked={prefs.frequency === frequency}
                  onChange={() => update({ frequency })}
                />
                {FREQUENCY_LABELS[frequency]}
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-will-light/80">Tell me when</legend>
            {(
              [
                ['statusChange', 'The will changes status'],
                ['checkinMissed', 'The owner misses a check-in'],
                ['readyToClaim', 'My share is ready to claim'],
              ] as const
            ).map(([event, label]) => (
              <label key={event} className="flex items-center gap-2 text-xs text-will-light/80">
                <input
                  type="checkbox"
                  checked={prefs.events[event]}
                  onChange={(e) => update({ events: { ...prefs.events, [event]: e.target.checked } })}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-will-light/80">Delivery methods</legend>
            <label className="flex items-center gap-2 text-xs text-will-light/80">
              <input
                type="checkbox"
                checked={prefs.channels.inApp}
                onChange={(e) => update({ channels: { ...prefs.channels, inApp: e.target.checked } })}
              />
              In the app
            </label>
            <label className="flex items-center gap-2 text-xs text-will-light/80">
              <input
                type="checkbox"
                checked={prefs.channels.email}
                onChange={(e) => update({ channels: { ...prefs.channels, email: e.target.checked } })}
              />
              Email
            </label>
            {prefs.channels.email ? (
              <input
                type="email"
                aria-label="Email address for notifications"
                placeholder="you@example.com"
                value={prefs.email}
                onChange={(e) => update({ email: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-will-dark px-3 py-1.5 text-xs text-will-light"
              />
            ) : null}
          </fieldset>
        </>
      ) : null}

      <button
        type="button"
        onClick={handleSave}
        className="rounded-full bg-will-purple px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-will-purple/90"
      >
        Save preferences
      </button>
      {errors.length > 0 ? (
        <ul role="alert" className="text-xs text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {saved ? <p className="text-xs text-emerald-300">{prefs.enabled ? 'Preferences saved.' : 'You will not be notified about this will.'}</p> : null}
    </section>
  );
}
