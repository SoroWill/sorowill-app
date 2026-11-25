/**
 * CSV import for beneficiaries (#887).
 *
 * Accepted format: one beneficiary per line, `address,percentage[,label]`, with an optional
 * header row (`address,percentage,label`). Quoted fields ("…") may contain commas. Parsing
 * never throws: every problem is reported against its 1-based line number, so the preview
 * can show exactly what to fix.
 */
import { isValidStellarAddress } from '@/lib/guardianValidation';

export const MAX_CSV_BENEFICIARIES = 100;
/** Files above this size are rejected before parsing. */
export const MAX_CSV_BYTES = 64 * 1024;

export interface CsvBeneficiaryRow {
  line: number;
  address: string;
  percentage: number;
  label?: string;
}

export interface CsvIssue {
  /** 1-based line in the file; 0 for problems with the file as a whole. */
  line: number;
  message: string;
}

export interface BeneficiaryCsvResult {
  rows: CsvBeneficiaryRow[];
  errors: CsvIssue[];
  warnings: CsvIssue[];
  /** Sum of the valid rows' percentages. */
  total: number;
}

const CONTRACT_ADDRESS = /^C[A-Z2-7]{55}$/;

/** Splits one CSV line into fields, honouring double-quoted fields and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function isAddress(value: string): boolean {
  return isValidStellarAddress(value) || CONTRACT_ADDRESS.test(value);
}

export function parseBeneficiaryCsv(text: string): BeneficiaryCsvResult {
  const result: BeneficiaryCsvResult = { rows: [], errors: [], warnings: [], total: 0 };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const seen = new Map<string, number>();
  let dataLines = 0;

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === '' || raw.trim().startsWith('#')) return;
    const fields = splitCsvLine(raw);

    // Optional header row.
    if (result.rows.length === 0 && result.errors.length === 0 && /^address$/i.test(fields[0] ?? '')) return;
    dataLines++;

    const [address = '', percentText = '', label = ''] = fields;
    if (fields.length < 2 || address === '') {
      result.errors.push({ line, message: 'Expected "address,percentage[,label]".' });
      return;
    }
    if (!isAddress(address.toUpperCase())) {
      result.errors.push({ line, message: `"${address}" is not a valid Stellar address.` });
      return;
    }
    const normalized = address.toUpperCase();
    const percentage = Number(percentText.replace(/%$/, ''));
    if (!/^\d+(\.\d+)?%?$/.test(percentText) || !Number.isFinite(percentage)) {
      result.errors.push({ line, message: `Percentage "${percentText}" is not a number.` });
      return;
    }
    if (!Number.isInteger(percentage)) {
      result.errors.push({ line, message: 'Percentages must be whole numbers.' });
      return;
    }
    if (percentage < 1 || percentage > 100) {
      result.errors.push({ line, message: 'Percentage must be between 1 and 100.' });
      return;
    }
    const previous = seen.get(normalized);
    if (previous !== undefined) {
      result.errors.push({ line, message: `Duplicate address (also on line ${previous}).` });
      return;
    }
    seen.set(normalized, line);
    result.rows.push({ line, address: normalized, percentage, ...(label ? { label } : {}) });
    result.total += percentage;
  });

  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push({ line: 0, message: 'The file has no beneficiary rows.' });
  }
  if (dataLines > MAX_CSV_BENEFICIARIES) {
    result.errors.push({ line: 0, message: `At most ${MAX_CSV_BENEFICIARIES} beneficiaries can be imported.` });
  }
  if (result.rows.length > 0 && result.total !== 100) {
    result.warnings.push({
      line: 0,
      message: `Percentages add up to ${result.total}%, not 100%. Adjust them after importing.`,
    });
  }
  return result;
}
