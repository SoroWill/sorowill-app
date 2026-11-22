'use client';

import { useEffect, useRef, useState } from 'react';

const DRAFT_KEY = 'will-form-draft';

type SaveStatus = 'idle' | 'saving' | 'saved';

interface WillFormData {
  fullName: string;
  email: string;
  assets: string;
  beneficiaries: string;
  notes: string;
}

const EMPTY_FORM: WillFormData = {
  fullName: '',
  email: '',
  assets: '',
  beneficiaries: '',
  notes: '',
};

export default function WillPage() {
  const [form, setForm] = useState<WillFormData>(EMPTY_FORM);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [submitted, setSubmitted] = useState(false);
  const restoredRef = useRef(false);

  // Restore previously saved draft when the user returns to the page.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WillFormData>;
        setForm({ ...EMPTY_FORM, ...parsed });
        setSaveStatus('saved');
      }
    } catch {
      // Ignore malformed drafts.
    }
  }, []);

  // Auto-save on every field change.
  useEffect(() => {
    if (!restoredRef.current) return;
    if (submitted) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('idle');
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, submitted]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // ...existing submit logic would go here...
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore storage errors.
    }
    setSubmitted(true);
    setSaveStatus('idle');
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create Your Will</h1>
        <span
          className="text-sm text-gray-500"
          aria-live="polite"
          data-testid="save-indicator"
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium">
            Full Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            value={form.fullName}
            onChange={handleChange}
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <div>
          <label htmlFor="assets" className="block text-sm font-medium">
            Assets
          </label>
          <textarea
            id="assets"
            name="assets"
            value={form.assets}
            onChange={handleChange}
            rows={3}
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <div>
          <label htmlFor="beneficiaries" className="block text-sm font-medium">
            Beneficiaries
          </label>
          <textarea
            id="beneficiaries"
            name="beneficiaries"
            value={form.beneficiaries}
            onChange={handleChange}
            rows={3}
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          Submit
        </button>
      </form>
    </div>
  );
}
