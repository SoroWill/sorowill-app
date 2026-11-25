/**
 * Version history of a will, for the comparison view (#885).
 *
 * The contract stores only the current state, so each time a will is loaded
 * on this device its relevant fields are snapshotted; a snapshot is added
 * only when something changed. History is per device (localStorage).
 */
import type { Beneficiary, Will } from '@sorowill/sdk';

export interface WillVersion {
  /** Epoch milliseconds when this version was first seen. */
  capturedAt: number;
  status: string;
  balance: string;
  checkinPeriodDays: number;
  gracePeriodDays: number;
  beneficiaries: Beneficiary[];
  guardians: string[];
}

export type FieldChange = { field: string; label: string; before: string; after: string };

export type BeneficiaryChange =
  | { kind: 'added'; address: string; after: number }
  | { kind: 'removed'; address: string; before: number }
  | { kind: 'changed'; address: string; before: number; after: number };

export interface VersionDiff {
  fields: FieldChange[];
  beneficiaries: BeneficiaryChange[];
}

const MAX_VERSIONS = 20;
const keyFor = (willId: string) => `sorowill:will-versions:${willId}`;

export function snapshotWill(will: Will, capturedAt: number = Date.now()): WillVersion {
  const raw = will as unknown as Record<string, unknown>;
  return {
    capturedAt,
    status: String(will.status),
    balance: String(will.balance),
    checkinPeriodDays: will.checkinPeriodDays,
    gracePeriodDays: will.gracePeriodDays,
    beneficiaries: will.beneficiaries.map((b) => ({ address: b.address, percentage: b.percentage })),
    guardians: Array.isArray(raw.guardians) ? (raw.guardians as string[]).map(String) : [],
  };
}

function sameContent(a: WillVersion, b: WillVersion): boolean {
  return JSON.stringify({ ...a, capturedAt: 0 }) === JSON.stringify({ ...b, capturedAt: 0 });
}

export function loadWillVersions(willId: string): WillVersion[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(keyFor(willId)) ?? '[]');
    return Array.isArray(raw) ? (raw as WillVersion[]) : [];
  } catch {
    return [];
  }
}

/** Records `will` if it differs from the latest known version. Returns the history (oldest first). */
export function recordWillVersion(will: Will, now: number = Date.now()): WillVersion[] {
  const versions = loadWillVersions(will.id);
  const snapshot = snapshotWill(will, now);
  const latest = versions[versions.length - 1];
  if (latest && sameContent(latest, snapshot)) return versions;
  const next = [...versions, snapshot].slice(-MAX_VERSIONS);
  try {
    window.localStorage.setItem(keyFor(will.id), JSON.stringify(next));
  } catch {
    // History is best-effort when storage is unavailable.
  }
  return next;
}

const FIELDS: { field: keyof WillVersion; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'balance', label: 'Balance' },
  { field: 'checkinPeriodDays', label: 'Check-in period (days)' },
  { field: 'gracePeriodDays', label: 'Grace period (days)' },
  { field: 'guardians', label: 'Guardians' },
];

/** What changed from `before` to `after`. */
export function diffWillVersions(before: WillVersion, after: WillVersion): VersionDiff {
  const fields: FieldChange[] = [];
  for (const { field, label } of FIELDS) {
    const a = String(Array.isArray(before[field]) ? (before[field] as string[]).join(', ') : before[field]);
    const b = String(Array.isArray(after[field]) ? (after[field] as string[]).join(', ') : after[field]);
    if (a !== b) fields.push({ field, label, before: a, after: b });
  }

  const beneficiaries: BeneficiaryChange[] = [];
  const beforeMap = new Map(before.beneficiaries.map((b) => [b.address, b.percentage]));
  const afterMap = new Map(after.beneficiaries.map((b) => [b.address, b.percentage]));
  for (const [address, percentage] of beforeMap) {
    if (!afterMap.has(address)) beneficiaries.push({ kind: 'removed', address, before: percentage });
    else if (afterMap.get(address) !== percentage)
      beneficiaries.push({ kind: 'changed', address, before: percentage, after: afterMap.get(address)! });
  }
  for (const [address, percentage] of afterMap) {
    if (!beforeMap.has(address)) beneficiaries.push({ kind: 'added', address, after: percentage });
  }
  return { fields, beneficiaries };
}
