'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const storageKey = 'sorowill:tutorial-step';

const STEP_KEYS = ['connect', 'create', 'checkIn', 'grace', 'claim'] as const;

/** Interactive, step-by-step tutorial (#899). Progress is persisted locally. */
export function InteractiveTutorial() {
  const t = useTranslations('learn.tutorial');
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isInteger(saved) && saved >= 0 && saved < STEP_KEYS.length) setStep(saved);
    } catch {
      // Progress simply is not persisted when storage is unavailable.
    }
  }, []);

  function go(next: number) {
    const clamped = Math.min(Math.max(next, 0), STEP_KEYS.length - 1);
    setStep(clamped);
    try {
      localStorage.setItem(storageKey, String(clamped));
    } catch {
      // The step still changes for this session.
    }
  }

  const key = STEP_KEYS[step];
  const isLast = step === STEP_KEYS.length - 1;

  return (
    <section aria-labelledby="tutorial-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="tutorial-heading" className="text-2xl font-bold text-will-light">{t('heading')}</h2>
        <p className="text-sm text-will-light/60">{t('description')}</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs font-mono text-will-purple" aria-live="polite">
          {t('progress', { current: step + 1, total: STEP_KEYS.length })}
        </p>
        <h3 className="mt-2 font-semibold text-will-light">{t(`steps.${key}.title`)}</h3>
        <p className="mt-1 text-sm text-will-light/70">{t(`steps.${key}.description`)}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            className="rounded-full border border-white/20 px-4 py-2 font-semibold text-will-light/80 transition hover:border-white/40 disabled:opacity-40"
          >
            {t('previous')}
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={() => go(0)}
              className="rounded-full bg-will-purple px-4 py-2 font-semibold text-white transition hover:bg-will-purple/90"
            >
              {t('restart')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(step + 1)}
              className="rounded-full bg-will-purple px-4 py-2 font-semibold text-white transition hover:bg-will-purple/90"
            >
              {t('next')}
            </button>
          )}
        </div>
        {isLast && <p className="mt-3 text-sm text-will-light/60">{t('completed')}</p>}
      </div>
    </section>
  );
}
