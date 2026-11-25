/**
 * Smart suggestions for the will form (#882): standard percentage splits,
 * splits and addresses the user has used before, and their most common
 * guardians. Suggestions are only ever offered — the form never applies them
 * on its own, and any suggested value can be edited afterwards.
 *
 * Learning is local: usage counts live in localStorage on this device and
 * are never sent anywhere.
 */

export interface SplitSuggestion {
  label: string;
  percentages: number[];
}

const STORAGE_KEY = 'sorowill:form-suggestions:v1';
const MAX_REMEMBERED = 50;

interface UsageStore {
  splits: Record<string, number>;
  beneficiaries: Record<string, number>;
  guardians: Record<string, number>;
}

/** Equal integer shares that add up to 100 (remainder to the first rows). */
export function equalShares(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

const STANDARD_SPLITS: Record<number, number[][]> = {
  2: [[50, 50], [60, 40], [70, 30]],
  3: [[50, 25, 25], [40, 30, 30]],
  4: [[40, 20, 20, 20]],
};

function splitLabel(percentages: number[]): string {
  return percentages.map((p) => `${p}%`).join(' / ');
}

function sameSplit(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function readStore(): UsageStore {
  const empty: UsageStore = { splits: {}, beneficiaries: {}, guardians: {} };
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return empty;
    const store = raw as Partial<UsageStore>;
    return {
      splits: store.splits ?? {},
      beneficiaries: store.beneficiaries ?? {},
      guardians: store.guardians ?? {},
    };
  } catch {
    return empty;
  }
}

function trim(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_REMEMBERED),
  );
}

function writeStore(store: UsageStore): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        splits: trim(store.splits),
        beneficiaries: trim(store.beneficiaries),
        guardians: trim(store.guardians),
      }),
    );
  } catch {
    // Suggestions are best-effort when storage is unavailable.
  }
}

/**
 * Splits to offer for `count` beneficiaries: the ones this user chose before
 * (most used first, marked "Used before"), then equal shares, then standard
 * splits, without duplicates.
 */
export function suggestSplits(count: number): SplitSuggestion[] {
  if (count < 2) return [];
  const learned = Object.entries(readStore().splits)
    .map(([key, uses]) => ({ percentages: key.split(',').map(Number), uses }))
    .filter((entry) => entry.percentages.length === count && entry.percentages.every(Number.isFinite))
    .sort((a, b) => b.uses - a.uses)
    .map((entry) => ({ label: `${splitLabel(entry.percentages)} (used before)`, percentages: entry.percentages }));

  const candidates: SplitSuggestion[] = [
    ...learned,
    { label: `Equal (${splitLabel(equalShares(count))})`, percentages: equalShares(count) },
    ...(STANDARD_SPLITS[count] ?? []).map((percentages) => ({ label: splitLabel(percentages), percentages })),
  ];
  const unique: SplitSuggestion[] = [];
  for (const candidate of candidates) {
    if (!unique.some((existing) => sameSplit(existing.percentages, candidate.percentages))) {
      unique.push(candidate);
    }
  }
  return unique.slice(0, 5);
}

/** Most frequently used addresses of a kind, excluding ones already in the form. */
export function suggestAddresses(
  kind: 'beneficiaries' | 'guardians',
  exclude: string[] = [],
  limit = 3,
): string[] {
  const taken = new Set(exclude.map((a) => a.trim()));
  return Object.entries(readStore()[kind])
    .sort((a, b) => b[1] - a[1])
    .map(([address]) => address)
    .filter((address) => !taken.has(address))
    .slice(0, limit);
}

/** Learns from a submitted will: its split, beneficiaries and guardians. */
export function recordWillFormUsage(input: {
  beneficiaries: { address: string; percentage: number }[];
  guardians?: string[];
}): void {
  const store = readStore();
  const percentages = input.beneficiaries.map((b) => b.percentage);
  if (percentages.length >= 2) {
    const key = percentages.join(',');
    store.splits[key] = (store.splits[key] ?? 0) + 1;
  }
  for (const { address } of input.beneficiaries) {
    const value = address.trim();
    if (value) store.beneficiaries[value] = (store.beneficiaries[value] ?? 0) + 1;
  }
  for (const guardian of input.guardians ?? []) {
    const value = guardian.trim();
    if (value) store.guardians[value] = (store.guardians[value] ?? 0) + 1;
  }
  writeStore(store);
}

/** Forgets everything learned on this device. */
export function clearFormSuggestions(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
