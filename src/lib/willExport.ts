import { formatUSDC, type Will } from '@sorowill/sdk';

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
    const formattedBalance = will.balance ? formatUSDC(BigInt(will.balance)) : '0';

    const beneficiariesStr = ((will.beneficiaries as any[]) || [])
      .map((b) => (typeof b === 'string' ? b : b?.address || ''))
      .join(';');

    const guardiansStr = ((will.guardians as any[]) || [])
      .map((g) => (typeof g === 'string' ? g : g?.address || ''))
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

export function validateExportData(original: Will, exported: any): boolean {
  if (!exported) return false;
  if (original.id !== exported.willId) return false;
  if (original.owner !== exported.owner) return false;

  if (exported.beneficiaries !== undefined) {
    if (!Array.isArray(exported.beneficiaries)) {
      return false;
    }
    if (original.beneficiaries && original.beneficiaries.length > 0) {
      const exportedAddrs = new Set(exported.beneficiaries);
      for (const b of original.beneficiaries) {
        if (!exportedAddrs.has(b.address)) {
          return false;
        }
      }
    }
  }

  return true;
}
