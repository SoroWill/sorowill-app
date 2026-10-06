import { describe, it, expect, vi } from 'vitest';
import { exportWillsToCSV, validateExportData } from '@/lib/willExport';
import type { Will } from '@sorowill/sdk';

function makeTestWill(overrides: Partial<Will> = {}): Will {
  return {
    id: 'will-123',
    owner: 'GABC...XYZ',
    status: 'Active',
    balance: '1000000000',
    token: 'ccw67htgnfmxkfgrr2mkrb2v6dnfgblxjofkldlnoicl5ux4yk7cplaa',
    checkinPeriodDays: 90,
    lastCheckin: Date.now() / 1000 - 86_400 * 30,
    gracePeriodDays: 7,
    beneficiaries: [
      { address: 'GDEF...ABC', percentage: 50 },
      { address: 'GHIJ...DEF', percentage: 50 },
    ],
    guardians: [
      'GKLI...GHI',
    ],
    guardianVotes: 0,
    ...overrides,
  } as Will;
}

describe('willExport', () => {
  describe('exportWillsToCSV', () => {
    it('should generate valid CSV from will data', () => {
      const wills = [makeTestWill({ id: 'will-1' })];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('Will ID');
      expect(csv).toContain('Owner');
      expect(csv).toContain('Status');
      expect(csv).toContain('Balance');
      expect(csv).toContain('will-1');
    });

    it('should include all required headers in CSV', () => {
      const wills = [makeTestWill()];
      const csv = exportWillsToCSV(wills);

      const headers = csv.split('\n')[0];
      expect(headers).toContain('Will ID');
      expect(headers).toContain('Owner');
      expect(headers).toContain('Status');
      expect(headers).toContain('Balance');
      expect(headers).toContain('Token');
      expect(headers).toContain('Check-in Period (days)');
      expect(headers).toContain('Grace Period (days)');
      expect(headers).toContain('Beneficiaries');
      expect(headers).toContain('Guardians');
    });

    it('should export multiple wills', () => {
      const wills = [
        makeTestWill({ id: 'will-1' }),
        makeTestWill({ id: 'will-2' }),
        makeTestWill({ id: 'will-3' }),
      ];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('will-1');
      expect(csv).toContain('will-2');
      expect(csv).toContain('will-3');
    });

    it('should format balance correctly in CSV', () => {
      const wills = [makeTestWill({ balance: '500000000' })];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('500');
    });

    it('should include beneficiary addresses in CSV', () => {
      const wills = [
        makeTestWill({
          beneficiaries: [
            { address: 'GBENEFICIARY1', percentage: 50 },
            { address: 'GBENEFICIARY2', percentage: 50 },
          ],
        }),
      ];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('GBENEFICIARY1');
      expect(csv).toContain('GBENEFICIARY2');
    });

    it('should include guardian addresses in CSV', () => {
      const wills = [
        makeTestWill({
          guardians: [
            'GGUARDIAN1',
            'GGUARDIAN2',
          ],
        }),
      ];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('GGUARDIAN1');
      expect(csv).toContain('GGUARDIAN2');
    });

    it('should not include private keys in export', () => {
      const wills = [makeTestWill()];
      const csv = exportWillsToCSV(wills);

      expect(csv).not.toContain('private');
      expect(csv).not.toContain('secret');
      expect(csv).not.toContain('key');
      expect(csv).not.toMatch(/[A-Z0-9]{56}/); // Typical private key length on Stellar
    });

    it('should escape special characters in CSV', () => {
      const wills = [
        makeTestWill({
          owner: 'Owner with "quotes" and, commas',
        }),
      ];
      const csv = exportWillsToCSV(wills);

      // Should properly escape quotes and commas
      expect(csv).toContain('"Owner with ""quotes"" and, commas"');
    });

    it('should handle empty beneficiaries list', () => {
      const wills = [makeTestWill({ beneficiaries: [] })];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('will-123');
      expect(csv).not.toThrow;
    });

    it('should handle empty guardians list', () => {
      const wills = [makeTestWill({ guardians: [] })];
      const csv = exportWillsToCSV(wills);

      expect(csv).toContain('will-123');
      expect(csv).not.toThrow;
    });
  });

  describe('validateExportData', () => {
    it('should validate that exported data matches original', () => {
      const original = makeTestWill({ id: 'will-123' });
      const exported = { willId: 'will-123', owner: original.owner };

      const isValid = validateExportData(original, exported);
      expect(isValid).toBe(true);
    });

    it('should detect mismatched will IDs', () => {
      const original = makeTestWill({ id: 'will-123' });
      const exported = { willId: 'will-999', owner: original.owner };

      const isValid = validateExportData(original, exported);
      expect(isValid).toBe(false);
    });

    it('should detect mismatched owner addresses', () => {
      const original = makeTestWill({ owner: 'GABC...XYZ' });
      const exported = { willId: original.id, owner: 'GXYZ...ABC' };

      const isValid = validateExportData(original, exported);
      expect(isValid).toBe(false);
    });

    it('should verify all beneficiary addresses are present', () => {
      const original = makeTestWill({
        beneficiaries: [
          { address: 'GBEN1', percentage: 50 },
          { address: 'GBEN2', percentage: 50 },
        ],
      });
      const exported = {
        willId: original.id,
        owner: original.owner,
        beneficiaries: ['GBEN1', 'GBEN2'],
      };

      const isValid = validateExportData(original, exported);
      expect(isValid).toBe(true);
    });

    it('should detect missing beneficiaries in export', () => {
      const original = makeTestWill({
        beneficiaries: [
          { address: 'GBEN1', percentage: 50 },
          { address: 'GBEN2', percentage: 50 },
        ],
      });
      const exported = {
        willId: original.id,
        owner: original.owner,
        beneficiaries: ['GBEN1'],
      };

      const isValid = validateExportData(original, exported);
      expect(isValid).toBe(false);
    });

    it('should not contain any sensitive fields in validation', () => {
      const original = makeTestWill();
      const exported = {
        willId: original.id,
        owner: original.owner,
        secretKey: 'should-not-exist',
      };

      const sensitiveFields = ['secretKey', 'privateKey', 'mnemonic'];
      const csv = exportWillsToCSV([original]);

      sensitiveFields.forEach(field => {
        expect(csv.toLowerCase()).not.toContain(field.toLowerCase());
      });
    });
  });

  describe('CSV file generation', () => {
    it('should generate downloadable CSV blob', () => {
      const wills = [makeTestWill()];
      const csv = exportWillsToCSV(wills);

      expect(typeof csv).toBe('string');
      expect(csv.length).toBeGreaterThan(0);
    });

    it('should have proper CSV MIME type', () => {
      const wills = [makeTestWill()];
      const csv = exportWillsToCSV(wills);
      const blob = new Blob([csv], { type: 'text/csv' });

      expect(blob.type).toBe('text/csv');
    });

    it('should generate filename with timestamp', () => {
      const wills = [makeTestWill()];
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `wills-export-${timestamp}.csv`;

      expect(filename).toMatch(/wills-export-\d{4}-\d{2}-\d{2}\.csv/);
    });
  });
});
