'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  allTags,
  exportAddressBook,
  importAddressBook,
  loadAddressBook,
  removeAddress,
  searchAddressBook,
  upsertAddress,
  type AddressBookEntry,
} from '@/lib/addressBook';

function short(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Loads the book after mount (localStorage is not available during SSR). */
function useAddressBook() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  useEffect(() => setEntries(loadAddressBook()), []);
  return [entries, setEntries] as const;
}

/**
 * Quick-select chips for forms (#888): pick a saved address by label, optionally narrowed by
 * tag. Addresses already used in the form (`exclude`) are hidden.
 */
export function AddressBookPicker({
  onPick,
  exclude = [],
  label = 'Address book',
}: {
  onPick: (address: string) => void;
  exclude?: string[];
  label?: string;
}) {
  const [entries] = useAddressBook();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const queryId = useId();
  const matches = useMemo(
    () => searchAddressBook(entries, query, tag || undefined).filter((e) => !exclude.includes(e.address)),
    [entries, query, tag, exclude],
  );
  if (entries.length === 0) return null;

  return (
    <div role="group" aria-label={label} className="space-y-2 rounded-lg border border-white/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-will-light/80">{label}:</span>
        <label htmlFor={queryId} className="sr-only">Search address book</label>
        <input
          id={queryId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="rounded border border-white/10 bg-will-dark px-2 py-0.5 text-xs text-will-light"
        />
        {allTags(entries).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tag === t}
            onClick={() => setTag(tag === t ? '' : t)}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${tag === t ? 'border-will-purple text-will-light' : 'border-white/15 text-will-light/60'}`}
          >
            #{t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {matches.slice(0, 12).map((e) => (
          <button
            key={e.address}
            type="button"
            title={e.address}
            aria-label={`Use ${e.label} (${e.address})`}
            onClick={() => onPick(e.address)}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-will-light/80 hover:border-will-purple"
          >
            {e.label} <span className="font-mono text-will-light/50">{short(e.address)}</span>
          </button>
        ))}
        {matches.length === 0 ? <span className="text-xs text-will-light/50">No matching addresses.</span> : null}
      </div>
    </div>
  );
}

/** Full manager (#888): add, edit, tag, delete, export and import saved addresses. */
export function AddressBookManager() {
  const [entries, setEntries] = useAddressBook();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [tags, setTags] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { address: useId(), label: useId(), tags: useId(), search: useId() };

  function handleSave() {
    const result = upsertAddress(entries, { address, label, tags: tags.split(',') });
    if (result.error) {
      setMessage({ kind: 'error', text: result.error });
      return;
    }
    setEntries(result.entries);
    setAddress('');
    setLabel('');
    setTags('');
    setMessage({ kind: 'ok', text: 'Address saved.' });
  }

  function handleExport() {
    const blob = new Blob([exportAddressBook(entries)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sorowill-address-book-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    const text = typeof file.text === 'function' ? await file.text() : await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    const result = importAddressBook(entries, text);
    if (result.error) {
      setMessage({ kind: 'error', text: result.error });
    } else {
      setEntries(result.entries);
      setMessage({ kind: 'ok', text: `Imported: ${result.added} added, ${result.updated} updated.` });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const visible = searchAddressBook(entries, query);

  return (
    <section aria-label="Address book" className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <label htmlFor={ids.address} className="text-xs text-will-light/80">
          Address
          <input id={ids.address} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="G…" className="mt-1 w-full rounded border border-white/10 bg-will-dark px-2 py-1 font-mono text-xs text-will-light" />
        </label>
        <label htmlFor={ids.label} className="text-xs text-will-light/80">
          Label
          <input id={ids.label} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sister" className="mt-1 w-full rounded border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light" />
        </label>
        <label htmlFor={ids.tags} className="text-xs text-will-light/80">
          Tags (comma separated)
          <input id={ids.tags} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="family, guardian" className="mt-1 w-full rounded border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleSave} className="rounded-full bg-will-purple px-4 py-1.5 text-xs font-semibold text-white">Save address</button>
        <button type="button" onClick={handleExport} disabled={entries.length === 0} className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-will-light/80 disabled:opacity-40">Export</button>
        <label className="cursor-pointer rounded-full border border-white/20 px-4 py-1.5 text-xs text-will-light/80">
          Import
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void handleImport(e.target.files?.[0])} />
        </label>
      </div>
      <p className="text-xs text-will-light/50">
        Saved on this device. To use your address book on another device, export it here and import the file there.
      </p>
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${message.kind === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
          {message.text}
        </p>
      ) : null}

      <label htmlFor={ids.search} className="sr-only">Search saved addresses</label>
      <input id={ids.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by label, address or tag" className="w-full rounded border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light" />
      <ul className="divide-y divide-white/5" aria-label="Saved addresses">
        {visible.map((e) => (
          <li key={e.address} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <div>
              <p className="font-medium text-will-light">{e.label}</p>
              <p className="font-mono text-will-light/60" title={e.address}>{e.address}</p>
              {e.tags.length ? <p className="text-will-light/50">{e.tags.map((t) => `#${t}`).join(' ')}</p> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAddress(e.address); setLabel(e.label); setTags(e.tags.join(', ')); }} className="underline">Edit</button>
              <button type="button" onClick={() => setEntries(removeAddress(entries, e.address))} className="text-red-300 underline" aria-label={`Delete ${e.label}`}>Delete</button>
            </div>
          </li>
        ))}
        {visible.length === 0 ? <li className="py-2 text-xs text-will-light/50">No saved addresses.</li> : null}
      </ul>
    </section>
  );
}
