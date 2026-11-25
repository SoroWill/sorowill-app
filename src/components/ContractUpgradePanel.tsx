'use client';

import { useCallback, useEffect, useState } from 'react';

import { getContractVersion } from '@/lib/sorowill';
import {
  compareContractVersions,
  loadMigratedVersion,
  saveMigratedVersion,
  type VersionComparison,
} from '@/lib/contractVersion';
import { formatError } from '@/lib/errors';
import { useToast } from '@/components/Toast';
import { StatusMessageBanner, type StatusMessageVariant } from '@/components/StatusMessageBanner';

interface Message {
  variant: StatusMessageVariant;
  text: string;
}

/**
 * Smart contract version migration UI (#906).
 *
 * Shows when a newer contract version is deployed, explains what changed,
 * and offers a one-click upgrade. After upgrading, the previous version is
 * offered as a rollback. The migration is recorded locally so the banner
 * does not reappear on every visit.
 */
export function ContractUpgradePanel() {
  const toast = useToast();
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'upgrade' | 'rollback' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deployed = await getContractVersion();
      if (deployed === null) {
        setComparison(null);
        return;
      }
      setComparison(compareContractVersions(deployed, loadMigratedVersion()));
    } catch (err) {
      setComparison(null);
      setMessage({ variant: 'error', text: formatError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function migrate(target: number, action: 'upgrade' | 'rollback') {
    setBusy(action);
    setMessage(null);
    try {
      saveMigratedVersion(target);
      setComparison(compareContractVersions(target, target));
      const text =
        action === 'upgrade'
          ? `Upgraded to contract version ${target}.`
          : `Rolled back to contract version ${target}.`;
      setMessage({ variant: 'success', text });
      toast.success(text);
    } catch (err) {
      const text = formatError(err);
      setMessage({ variant: 'error', text });
      toast.error(text);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="skeleton h-4 w-40" />
      </div>
    );
  }

  if (!comparison || comparison.status === 'up-to-date') {
    return message ? (
      <StatusMessageBanner variant={message.variant} onDismiss={() => setMessage(null)}>
        {message.text}
      </StatusMessageBanner>
    ) : null;
  }

  const isUpgrade = comparison.status === 'upgrade-available';

  return (
    <section
      aria-labelledby="contract-upgrade-heading"
      className="space-y-3 rounded-xl border border-will-purple/40 bg-will-purple/10 p-4"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="contract-upgrade-heading" className="text-sm font-semibold text-will-light">
          {isUpgrade ? 'Contract upgrade available' : 'Rollback available'}
        </h2>
        <span className="text-xs text-will-light/60">
          v{comparison.current} → v{comparison.deployed}
        </span>
      </div>

      {isUpgrade ? (
        <>
          <p className="text-sm text-will-light/80">
            A newer version of the SoroWill contract (v{comparison.deployed}) is deployed on this network. Your
            wills stay on chain; upgrading only switches this app to the new version.
          </p>
          {comparison.changes.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-will-light/50">What changed</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-will-light/80">
                {comparison.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void migrate(comparison.deployed, 'upgrade')}
              disabled={busy !== null}
              className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60"
            >
              {busy === 'upgrade' ? 'Upgrading…' : `Upgrade to v${comparison.deployed}`}
            </button>
            <button
              type="button"
              onClick={() => setComparison(null)}
              disabled={busy !== null}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light disabled:opacity-60"
            >
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-will-light/80">
            This app is set to contract v{comparison.current}, but v{comparison.deployed} is deployed on this
            network.
            {comparison.rollbackTo ? ` Rolling back returns you to “${comparison.rollbackTo.title}”.` : ''}
          </p>
          <button
            type="button"
            onClick={() => void migrate(comparison.deployed, 'rollback')}
            disabled={busy !== null}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light disabled:opacity-60"
          >
            {busy === 'rollback' ? 'Rolling back…' : `Roll back to v${comparison.deployed}`}
          </button>
        </>
      )}

      {message ? (
        <StatusMessageBanner variant={message.variant} onDismiss={() => setMessage(null)}>
          {message.text}
        </StatusMessageBanner>
      ) : null}
    </section>
  );
}
