/**
 * Address book (#888): saved addresses with a label and tags for quick selection in forms.
 *
 * Entries live in this browser's localStorage. To use them on another device, export the
 * book as a JSON file and import it there (merging by address); nothing is uploaded.
 */
import { isValidStellarAddress } from '@/lib/guardianValidation';

export const ADDRESS_BOOK_KEY = 'sorowill:address-book:v1';
export const ADDRESS_BOOK_EXPORT_VERSION = 1;
export const MAX_ADDRESS_BOOK_ENTRIES = 200;
export const MAX_LABEL_LENGTH = 60;
export const MAX_TAGS = 10;

export interface AddressBookEntry {
  address: string;
  label: string;
  tags: string[];
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

const CONTRACT_ADDRESS = /^C[A-Z2-7]{55}$/;

export function isBookAddress(address: string): boolean {
  return isValidStellarAddress(address) || CONTRACT_ADDRESS.test(address);
}

export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const value = tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24);
    if (value && !out.includes(value)) out.push(value);
  }
  return out.slice(0, MAX_TAGS);
}

function isEntry(value: unknown): value is AddressBookEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<AddressBookEntry>;
  return (
    typeof e.address === 'string' &&
    isBookAddress(e.address) &&
    typeof e.label === 'string' &&
    Array.isArray(e.tags) &&
    e.tags.every((t) => typeof t === 'string')
  );
}

export function loadAddressBook(): AddressBookEntry[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(ADDRESS_BOOK_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function save(entries: AddressBookEntry[]): void {
  try {
    window.localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the in-memory list still reflects the change.
  }
}

/** Adds a new entry or updates the label/tags of an existing one. Returns the new list or an error. */
export function upsertAddress(
  entries: AddressBookEntry[],
  input: { address: string; label: string; tags?: string[] },
  now: Date = new Date(),
): { entries: AddressBookEntry[]; error?: string } {
  const address = input.address.trim().toUpperCase();
  const label = input.label.trim();
  if (!isBookAddress(address)) return { entries, error: 'Enter a valid Stellar address (G… or C…).' };
  if (!label) return { entries, error: 'Give the address a label.' };
  if (label.length > MAX_LABEL_LENGTH) return { entries, error: `Labels can be at most ${MAX_LABEL_LENGTH} characters.` };

  const tags = normalizeTags(input.tags ?? []);
  const stamp = now.toISOString();
  const existing = entries.find((e) => e.address === address);
  let next: AddressBookEntry[];
  if (existing) {
    next = entries.map((e) => (e.address === address ? { ...e, label, tags, updatedAt: stamp } : e));
  } else {
    if (entries.length >= MAX_ADDRESS_BOOK_ENTRIES) {
      return { entries, error: `The address book is full (${MAX_ADDRESS_BOOK_ENTRIES} entries).` };
    }
    next = [...entries, { address, label, tags, createdAt: stamp, updatedAt: stamp }];
  }
  save(next);
  return { entries: next };
}

export function removeAddress(entries: AddressBookEntry[], address: string): AddressBookEntry[] {
  const next = entries.filter((e) => e.address !== address);
  save(next);
  return next;
}

/** Case-insensitive match on label, address or tag; `tag` narrows to entries carrying it. */
export function searchAddressBook(entries: AddressBookEntry[], query: string, tag?: string): AddressBookEntry[] {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => !tag || e.tags.includes(tag))
    .filter(
      (e) =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.address.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q)),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function allTags(entries: AddressBookEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.tags))].sort();
}

export function exportAddressBook(entries: AddressBookEntry[], exportedAt: Date = new Date()): string {
  return JSON.stringify(
    { version: ADDRESS_BOOK_EXPORT_VERSION, exportedAt: exportedAt.toISOString(), entries },
    null,
    2,
  );
}

/**
 * Merges an exported book into `entries`. For an address in both, the copy with the later
 * `updatedAt` wins, so importing the same file twice is a no-op.
 */
export function importAddressBook(
  entries: AddressBookEntry[],
  json: string,
): { entries: AddressBookEntry[]; added: number; updated: number; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { entries, added: 0, updated: 0, error: 'The file is not valid JSON.' };
  }
  const incoming = (parsed as { entries?: unknown })?.entries;
  if (!Array.isArray(incoming)) {
    return { entries, added: 0, updated: 0, error: 'This is not a SoroWill address book export.' };
  }
  const byAddress = new Map(entries.map((e) => [e.address, e]));
  let added = 0;
  let updated = 0;
  for (const item of incoming.filter(isEntry)) {
    const entry: AddressBookEntry = { ...item, tags: normalizeTags(item.tags) };
    const current = byAddress.get(entry.address);
    if (!current) {
      if (byAddress.size >= MAX_ADDRESS_BOOK_ENTRIES) break;
      byAddress.set(entry.address, entry);
      added++;
    } else if ((entry.updatedAt ?? '') > (current.updatedAt ?? '')) {
      byAddress.set(entry.address, entry);
      updated++;
    }
  }
  const next = [...byAddress.values()];
  save(next);
  return { entries: next, added, updated };
}
