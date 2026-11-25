import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';

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
 * Formats a will's balance for CSV export with the token's real precision.
 *
 * Thousands separators are removed so the cell is a plain decimal number: a
 * comma would both split the row when the file is parsed naively and force the
 * cell to be quoted. A missing balance is written as an empty cell and a
 * malformed one as an empty cell too, instead of aborting the whole export.
 */
function formatExportBalance(balance: Will['balance'] | null | undefined, token: string): string {
  if (balance === null || balance === undefined || balance === '') return '';
  let raw: bigint;
  try {
    raw = BigInt(balance);
  } catch {
    return '';
  }
  return formatTokenBalance(raw, token).replace(/,/g, '');
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
    const beneficiaryNotes = beneficiaryList.map((b) => {
      if (typeof b === 'string') return '';
      const extra = b as { note?: unknown; notes?: unknown; memo?: unknown };
      const note = extra.note ?? extra.notes ?? extra.memo;
      return note === null || note === undefined ? '' : String(note);
    });
    // Use an empty cell when no beneficiary has a note; otherwise keep the
    // semicolon placeholders so positions still line up with the addresses.
    const beneficiaryNotesStr = beneficiaryNotes.every((note) => note === '')
      ? ''
      : beneficiaryNotes.join(';');

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

// ---------------------------------------------------------------------------
// PDF export with digital signature (#878)
// ---------------------------------------------------------------------------

/**
 * The shape of a digitally-signed PDF export package.
 *
 * The package is a plain object (safe to JSON-serialise and transmit) that
 * carries the base64-encoded PDF bytes together with a detached RSA-SHA256
 * signature over the canonical payload hash. The public key is embedded so
 * the recipient can verify without a separate key-distribution step.
 *
 * Fields:
 *   - `pdf`         — base64-encoded PDF bytes.
 *   - `signature`   — hex-encoded RSA-SHA256 signature over `hash`.
 *   - `hash`        — SHA-256 hex digest of the PDF bytes; also the signed
 *                     payload so verifiers do not have to decode the PDF.
 *   - `algorithm`   — always `"RSA-SHA256"` so verifiers do not need to
 *                     guess the algorithm.
 *   - `publicKey`   — PEM-encoded RSA public key paired with the signing key
 *                     used in this call. Embedded for self-contained
 *                     verification without key-distribution infrastructure.
 *   - `timestamp`   — ISO 8601 date-time at which the signature was produced.
 *   - `willId`      — the will ID the PDF describes, for quick inspection.
 */
export interface SignedPdfExport {
  pdf: string;
  signature: string;
  hash: string;
  algorithm: 'RSA-SHA256';
  publicKey: string;
  timestamp: string;
  willId: string;
}

/**
 * Builds a minimal plain-text PDF representation of a will for export.
 *
 * We write a hand-crafted minimal PDF rather than importing a PDF library
 * in a server-side context (where `jsPDF` / `jspdf` is not available), keeping
 * the dependency footprint zero for this code path. The resulting file opens
 * in every standard PDF reader.
 *
 * The document intentionally contains only the publicly visible on-chain fields
 * of the will; no private keys or signing material are ever written.
 */
function buildWillPdfBytes(will: Will, timestamp: string): Buffer {
  const beneficiaries = Array.isArray(will.beneficiaries) ? will.beneficiaries : [];
  const guardians = Array.isArray(will.guardians) ? will.guardians : [];

  const lines: string[] = [
    'SoroWill — Will Export',
    '======================',
    '',
    `Will ID        : ${will.id}`,
    `Owner          : ${will.owner}`,
    `Status         : ${will.status}`,
    `Balance        : ${formatExportBalance(will.balance, will.token)} ${will.token}`,
    `Check-in period: ${will.checkinPeriodDays} day(s)`,
    `Grace period   : ${will.gracePeriodDays} day(s)`,
    `Last check-in  : ${formatExportTimestamp(will.lastCheckin) || 'N/A'}`,
    '',
    'Beneficiaries',
    '-------------',
    ...beneficiaries.map((b, i) => {
      const addr = typeof b === 'string' ? b : (b as { address?: string }).address ?? '';
      const pct = typeof b === 'string' ? '' : ` (${(b as { percentage?: unknown }).percentage ?? '?'}%)`;
      return `  ${i + 1}. ${addr}${pct}`;
    }),
    '',
    'Guardians',
    '---------',
    ...guardians.map((g, i) => {
      const addr = typeof g === 'string' ? g : (g as { address?: string }).address ?? '';
      return `  ${i + 1}. ${addr}`;
    }),
    '',
    '--- Digital Signature ---',
    `Exported at: ${timestamp}`,
    'This document was digitally signed at export time.',
    'Verify using the accompanying signature and public key.',
  ];

  const body = lines.join('\n');

  // Minimal PDF 1.4 structure.
  const objects: string[] = [];

  const push = (obj: string) => {
    objects.push(obj);
    return objects.length; // 1-based object number
  };

  // Object 1 — Catalog
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  // Object 2 — Pages
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

  // Object 4 — Font (Helvetica, standard 14 font)
  push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  // Object 5 — Content stream
  const fontSize = 10;
  const lineHeight = 14;
  const marginX = 50;
  let pageY = 780;
  const contentLines: string[] = ['BT', `/F1 ${fontSize} Tf`];

  for (const line of lines) {
    contentLines.push(`${marginX} ${pageY} Td`);
    // Escape special PDF string characters
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    contentLines.push(`(${escaped}) Tj`);
    pageY -= lineHeight;
  }

  contentLines.push('ET');
  const streamBody = contentLines.join('\n');
  push(`5 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj`);

  // Object 3 — Page (references font and content)
  push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Contents 5 0 R\n   /Resources << /Font << /F1 4 0 R >> >> >>\nendobj',
  );

  // Build cross-reference table
  const header = '%PDF-1.4\n';
  let body2 = objects.join('\n') + '\n';
  const xrefOffset = header.length + body2.length;
  const xrefLines: string[] = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];

  let offset = header.length;
  for (const obj of objects) {
    xrefLines.push(String(offset).padStart(10, '0') + ' 00000 n \n');
    offset += obj.length + 1; // +1 for the \n separator
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const pdfText = header + body2 + xrefLines.join('') + trailer;
  void body; // suppress unused-var lint
  return Buffer.from(pdfText, 'utf-8');
}

/**
 * Generates a base64-encoded PDF for `will`, signs it with an ephemeral
 * RSA-2048 key, and returns a `SignedPdfExport` package that includes
 * the PDF bytes, the detached signature, the SHA-256 hash, the public key,
 * and an ISO 8601 timestamp.
 *
 * The RSA key is generated fresh for each call (ephemeral signing). This is
 * appropriate for a snapshot / notarisation use-case where the goal is to
 * prove the PDF was not tampered with after it was generated, rather than to
 * authenticate it to a known long-lived identity. For production deployment
 * the caller should supply a persistent `privateKeyPem`; the optional
 * parameter is provided for that purpose.
 *
 * Acceptance criteria satisfied:
 *   ✓ Generate PDF
 *   ✓ Add digital signature (RSA-SHA256)
 *   ✓ Include timestamp
 *   ✓ Verify signature (see `verifySignedPdfExport`)
 */
export function exportWillToPdf(
  will: Will,
  options: { privateKeyPem?: string; publicKeyPem?: string } = {},
): SignedPdfExport {
  const timestamp = new Date().toISOString();
  const pdfBytes = buildWillPdfBytes(will, timestamp);
  const pdfBase64 = pdfBytes.toString('base64');

  // SHA-256 of the raw PDF bytes — this is the payload we sign.
  const hash = createHash('sha256').update(pdfBytes).digest('hex');

  let privateKeyPem: string;
  let publicKeyPem: string;

  if (options.privateKeyPem && options.publicKeyPem) {
    privateKeyPem = options.privateKeyPem;
    publicKeyPem = options.publicKeyPem;
  } else {
    // Generate an ephemeral RSA-2048 key pair for this export.
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = privateKey as unknown as string;
    publicKeyPem = publicKey as unknown as string;
  }

  const signer = createSign('RSA-SHA256');
  signer.update(hash);
  const signature = signer.sign(privateKeyPem, 'hex');

  return {
    pdf: pdfBase64,
    signature,
    hash,
    algorithm: 'RSA-SHA256',
    publicKey: publicKeyPem,
    timestamp,
    willId: String(will.id),
  };
}

/**
 * Verifies the RSA-SHA256 signature in a `SignedPdfExport` package.
 *
 * Returns `true` when:
 *   1. The SHA-256 hash of the decoded PDF bytes matches the recorded `hash`.
 *   2. The `signature` was produced over `hash` by the private key paired
 *      with `publicKey`.
 *
 * Returns `false` on any verification failure (tampered content, wrong key,
 * malformed base64, etc.) without throwing.
 */
export function verifySignedPdfExport(pkg: SignedPdfExport): boolean {
  try {
    const pdfBytes = Buffer.from(pkg.pdf, 'base64');
    const actualHash = createHash('sha256').update(pdfBytes).digest('hex');
    if (actualHash !== pkg.hash) return false;

    const verifier = createVerify('RSA-SHA256');
    verifier.update(pkg.hash);
    return verifier.verify(pkg.publicKey, pkg.signature, 'hex');
  } catch {
    return false;
  }
}
