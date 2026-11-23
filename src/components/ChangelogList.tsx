'use client';

import { Fragment, useMemo, useState } from 'react';

export interface ChangelogEntry {
  /** Version label as shown, for example `v0.1.0`. */
  version: string;
  date?: string;
  title?: string;
  highlights: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `query` (already trimmed and lower-cased) appears in any searchable field of `entry`. */
export function entryMatches(entry: ChangelogEntry, query: string): boolean {
  if (!query) return true;
  const fields = [entry.version, entry.title ?? '', entry.date ?? '', ...entry.highlights];
  return fields.some((field) => field.toLowerCase().includes(query));
}

/** Number of fields that contain the query, across every entry (used for the "N matches" count). */
export function countMatches(entries: ChangelogEntry[], query: string): number {
  if (!query) return 0;
  let count = 0;
  for (const entry of entries) {
    const fields = [entry.version, entry.title ?? '', entry.date ?? '', ...entry.highlights];
    for (const field of fields) {
      if (field.toLowerCase().includes(query)) count += 1;
    }
  }
  return count;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query ? (
          <mark key={index} className="rounded bg-will-purple/40 px-0.5 text-will-light">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Searchable list of release notes. Filters by version or keyword, highlights
 * the matching text and reports how many matches were found (#813).
 */
export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const visible = useMemo(() => entries.filter((entry) => entryMatches(entry, query)), [entries, query]);
  const matchCount = useMemo(() => countMatches(entries, query), [entries, query]);

  return (
    <section className="space-y-8">
      <div>
        <label htmlFor="changelog-search" className="sr-only">
          Search the changelog
        </label>
        <input
          id="changelog-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by version or keyword"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
        />
        {query && (
          <p role="status" aria-live="polite" className="mt-2 text-xs text-will-light/60">
            {matchCount === 0
              ? 'No matches'
              : `${matchCount} ${matchCount === 1 ? 'match' : 'matches'} in ${visible.length} ${
                  visible.length === 1 ? 'release' : 'releases'
                }`}
          </p>
        )}
      </div>

      {visible.map((entry) => (
        <div
          key={entry.version}
          className={`rounded-lg border bg-white/5 p-6 ${
            entry.version === entries[0]?.version ? 'border-will-purple' : 'border-white/10'
          }`}
        >
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold text-will-light">
                <Highlight text={entry.version} query={query} />
              </h2>
              {entry.title && (
                <p className="text-sm text-will-light/60">
                  <Highlight text={entry.title} query={query} />
                </p>
              )}
            </div>
            {entry.date && (
              <time className="rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-will-light/70">
                <Highlight text={entry.date} query={query} />
              </time>
            )}
          </div>

          <div className="mt-4">
            <ul className="space-y-3">
              {entry.highlights.map((item) => (
                <li key={item} className="flex gap-3 text-will-light/80">
                  <span className="shrink-0 text-will-purple">▸</span>
                  <span>
                    <Highlight text={item} query={query} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {entry.version === entries[0]?.version && (
            <div className="mt-4 rounded-lg border border-will-purple/30 bg-will-purple/10 p-3">
              <p className="text-sm text-will-purple">🚀 Latest Release</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
