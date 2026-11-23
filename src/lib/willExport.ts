import { type Will } from '@sorowill/sdk';

import { formatTokenBalance } from '@/lib/tokenDecimals';

function isValidBeneficiaryAddress(address: unknown): boolean {
  return typeof address === 'string' && address.trim().length > 0;
}

/**
 * Validates that every will's beneficiaries have a non-empty address before
 * they are written into the CSV export. An empty address would otherwise
 * silently drop a field and shift/corrupt the CSV row.
 */
export function validateBeneficiariesForExport(wills: Will[]): void {
  wills.forEach((will) => {
    const beneficiaries = Array.isArray(will.beneficiaries) ? will.beneficiaries : [];
    beneficiaries.forEach((b) => {
      const address = typeof b === 'string' ? b : (b as { address?: unknown })?.address;
      if (!isValidBeneficiaryAddress(address)) {
        throw new Error(`Will ${will.id ?? '<unknown>'} has a beneficiary with an invalid or empty address`);
      }
    });
  });
}

function escapeCSVField(val: string | number | bigint | null | undefined): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a will's balance for CSV export. A zero or missing balance is always
 * written as `0` regardless of how it is represented (`0n`, `'0'`, `''`),
 * rather than sometimes `0` and sometimes `0.0000000` (#699). A malformed
 * balance is written as an empty cell instead of aborting the whole export.
 */
function formatExportBalance(balance: Will['balance'] | null | undefined, token: string): string {
  if (balance === null || balance === undefined || balance === '') return '0';
  let raw: bigint;
  try {
    raw = BigInt(balance);
  } catch {
    return '';
  }
  if (raw === 0n) return '0';
  return formatTokenBalance(raw, token);
}

/** ISO 8601 timestamp (unix seconds, bigint, string or Date input); empty for missing/invalid values. */
function formatExportTimestamp(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '';
    date = new Date(seconds * 1000);
  }
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function exportWillsToCSV(wills: Will[]): string {
  validateBeneficiariesForExport(wills);

  const headers = [
    'Will ID',
    'Owner',
    'Status',
    'Balance',
    'Token',
    'Check-in Period (days)',
    'Grace Period (days)',
    'Last Check-in',
    'Beneficiaries',
    'Guardians',
    'Beneficiary Percentages',
    'Beneficiary Notes',
    'Guardian Votes',
    'Will Notes',
    'Memo',
  ];

  const rows = wills.map((will) => {
    const formattedBalance = formatExportBalance(will.balance, will.token);

    const beneficiariesStr = (Array.isArray(will.beneficiaries) ? will.beneficiaries : [])
      .map((b) => (typeof b === 'string' ? b : (b as { address?: string })?.address || ''))
      .join(';');

    const guardiansStr = (Array.isArray(will.guardians) ? will.guardians : [])
      .map((g) => (typeof g === 'string' ? g : (g as { address?: string })?.address || ''))
      .join(';');

    const beneficiaryList = Array.isArray(will.beneficiaries) ? will.beneficiaries : [];
    const percentagesStr = beneficiaryList
      .map((b) => (typeof b === 'string' ? '' : String((b as { percentage?: unknown })?.percentage ?? '')))
      .join(';');
    const beneficiaryNotesStr = beneficiaryList
      .map((b) => {
        if (typeof b === 'string') return '';
        const extra = b as { note?: unknown; notes?: unknown; memo?: unknown };
        const note = extra.note ?? extra.notes ?? extra.memo;
        return note === null || note === undefined ? '' : String(note);
      })
      .join(';');

    const extra = will as unknown as {
      guardianVotes?: number | bigint | null;
      notes?: string | null;
      memo?: string | null;
    };

    return [
      escapeCSVField(will.id),
      escapeCSVField(will.owner),
      escapeCSVField(will.status),
      escapeCSVField(formattedBalance),
      escapeCSVField(will.token),
      escapeCSVField(will.checkinPeriodDays),
      escapeCSVField(will.gracePeriodDays),
      escapeCSVField(formatExportTimestamp(will.lastCheckin)),
      escapeCSVField(beneficiariesStr),
      escapeCSVField(guardiansStr),
      escapeCSVField(percentagesStr),
      escapeCSVField(beneficiaryNotesStr),
      escapeCSVField(extra.guardianVotes),
      escapeCSVField(extra.notes),
      escapeCSVField(extra.memo),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/** Version of the JSON export layout, bumped if the shape changes. */
export const JSON_EXPORT_VERSION = 1;

/** JSON has no bigint, so bigint values (balances, votes) are written as decimal strings. */
function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Exports wills as pretty printed JSON (#827). Every field the will has is included, with bigint
 * values written as strings and dates as ISO 8601. `balanceFormatted` sits next to the raw
 * `balance` so the file is readable without knowing the token's decimals. Beneficiary addresses
 * are validated first, as for the CSV export.
 */
export function exportWillsToJSON(wills: Will[], exportedAt: Date = new Date()): string {
  validateBeneficiariesForExport(wills);

  const entries = wills.map((will) => ({
    ...will,
    balanceFormatted: formatExportBalance(will.balance, will.token),
  }));

  return JSON.stringify(
    { version: JSON_EXPORT_VERSION, exportedAt: exportedAt.toISOString(), count: entries.length, wills: entries },
    jsonReplacer,
    2,
  );
}

/** File name for an export, for example `sorowill-wills-2026-11-22.json`. */
export function exportFileName(extension: 'csv' | 'json', date: Date = new Date()): string {
  return `sorowill-wills-${date.toISOString().slice(0, 10)}.${extension}`;
}

export function validateExportData(original: Will, exported: unknown): boolean {
  if (!exported || typeof exported !== 'object') return false;
  const obj = exported as Record<string, unknown>;

  if (original.id !== obj.willId) return false;
  if (original.owner !== obj.owner) return false;

  if (obj.beneficiaries !== undefined) {
    if (!Array.isArray(obj.beneficiaries)) {
      return false;
    }
    if (original.beneficiaries && original.beneficiaries.length > 0) {
      const exportedAddrs = new Set(obj.beneficiaries);
      for (const b of original.beneficiaries) {
        if (!exportedAddrs.has(b.address)) {
          return false;
        }
      }
    }
  }

  return true;
}
