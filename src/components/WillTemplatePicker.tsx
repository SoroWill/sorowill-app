'use client';

import { useEffect, useId, useState } from 'react';
import {
  BUILT_IN_TEMPLATES,
  deleteCustomTemplate,
  loadCustomTemplates,
  saveCustomTemplate,
  templateShareUrl,
  type TemplateShare,
  type WillTemplate,
} from '@/lib/willTemplates';

/**
 * Will templates (#890): apply a built-in or saved template to the new-will form, save the
 * current form as a template, and share a template as a link. Templates hold labelled shares
 * and periods only, never addresses.
 */
export function WillTemplatePicker({
  onApply,
  current,
  sharedTemplate,
}: {
  onApply: (template: WillTemplate) => void;
  /** The form's current shares and periods, for "Save as template". */
  current: { shares: TemplateShare[]; checkinPeriodDays: number; gracePeriodDays: number };
  /** Template decoded from a `?template=` share link, offered first when present. */
  sharedTemplate?: WillTemplate | null;
}) {
  const [custom, setCustom] = useState<WillTemplate[]>([]);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const nameId = useId();

  useEffect(() => setCustom(loadCustomTemplates()), []);

  const templates = [...(sharedTemplate ? [sharedTemplate] : []), ...BUILT_IN_TEMPLATES, ...custom];

  function handleSave() {
    const problems = saveCustomTemplate({ name, description: 'Saved from a will draft', ...current });
    setErrors(problems);
    if (problems.length === 0) {
      setCustom(loadCustomTemplates());
      setStatus(`Saved template "${name.trim()}".`);
      setName('');
    }
  }

  async function handleShare(t: WillTemplate) {
    const url = templateShareUrl(t, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      setStatus(`Share link for "${t.name}" copied.`);
    } catch {
      setStatus(url);
    }
  }

  return (
    <section aria-label="Will templates" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-will-light">Start from a template</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className="rounded-lg border border-white/10 p-3 text-xs">
            <p className="font-medium text-will-light">
              {t.name}
              {t.id === 'shared' ? <span className="ml-2 text-amber-300">(shared with you)</span> : null}
              {!t.builtIn && t.id !== 'shared' ? <span className="ml-2 text-will-light/50">(yours)</span> : null}
            </p>
            <p className="text-will-light/60">{t.description}</p>
            <p className="mt-1 text-will-light/70">
              {t.shares.map((s) => `${s.label} ${s.percentage}%`).join(' · ')} · check-in {t.checkinPeriodDays}d · grace {t.gracePeriodDays}d
            </p>
            <div className="mt-2 flex gap-3">
              <button type="button" className="underline" onClick={() => onApply(t)} aria-label={`Use template ${t.name}`}>Use</button>
              <button type="button" className="underline" onClick={() => void handleShare(t)} aria-label={`Share template ${t.name}`}>Share</button>
              {!t.builtIn && t.id !== 'shared' ? (
                <button
                  type="button"
                  className="text-red-300 underline"
                  aria-label={`Delete template ${t.name}`}
                  onClick={() => {
                    deleteCustomTemplate(t.id);
                    setCustom(loadCustomTemplates());
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={nameId} className="text-xs text-will-light/80">
          Save the current shares and periods as a template
          <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="mt-1 block rounded border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light" />
        </label>
        <button type="button" onClick={handleSave} className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-will-light/80">Save template</button>
      </div>
      {errors.length ? (
        <ul role="alert" className="text-xs text-red-300">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}
      {status ? <p role="status" className="break-all text-xs text-emerald-300">{status}</p> : null}
      <p className="text-xs text-will-light/50">Templates never include addresses; fill those in after applying one.</p>
    </section>
  );
}
