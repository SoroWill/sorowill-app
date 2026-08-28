import type { Will } from '@sorowill/sdk';

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

export function exportWillsToCSV(wills: Will[]): string {
  const headers = [
    'Will ID',
    'Owner',
    'Status',
    'Balance',
    'Token',
    'Check-in Period (days)',
    'Grace Period (days)',
    'Beneficiaries',
    'Guardians',
  ];

  const rows = wills.map((will) => {
    // Format balance by dividing by 1,000,000 (USDC standard)
    const formattedBalance = will.balance ? Number(will.balance) / 1_000_000 : 0;

    const beneficiariesStr = (Array.isArray(will.beneficiaries) ? will.beneficiaries : [])
      .map((b) => (typeof b === 'string' ? b : (b as { address?: string })?.address || ''))
      .join(';');

    const guardiansStr = (Array.isArray(will.guardians) ? will.guardians : [])
      .map((g) => (typeof g === 'string' ? g : (g as { address?: string })?.address || ''))
      .join(';');

    return [
      escapeCSVField(will.id),
      escapeCSVField(will.owner),
      escapeCSVField(will.status),
      escapeCSVField(formattedBalance),
      escapeCSVField(will.token),
      escapeCSVField(will.checkinPeriodDays),
      escapeCSVField(will.gracePeriodDays),
      escapeCSVField(beneficiariesStr),
      escapeCSVField(guardiansStr),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
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
