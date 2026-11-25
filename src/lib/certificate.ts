import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

import { formatDeadline, formatUSDC, type Will } from '@sorowill/sdk';

import { nextCheckinDeadline } from '@/lib/deadlines';
import { QR_ERROR_CORRECTION, QR_QUIET_ZONE_MODULES } from '@/lib/qrOptions';

function parseCreationDate(value: unknown): Date | null {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (typeof value === 'number') {
    date = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  } else {
    return null;
  }

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Generates a QR code data URL entirely client-side for `data`, so the
 * encoded value (e.g. a verification URL embedding a will id) is never
 * sent to a third-party image API. Uses the same bundled `qrcode`
 * package already relied on for the PDF export below.
 */
export async function generateQrDataUrl(data: string, width = 240): Promise<string> {
  // High error correction and a full quiet zone so the printed or screenshotted code still scans (#832).
  return QRCode.toDataURL(data, { margin: QR_QUIET_ZONE_MODULES, width, errorCorrectionLevel: QR_ERROR_CORRECTION });
}

/** Raised when the certificate PDF (or its QR code) could not be produced. */
export class CertificateExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CertificateExportError';
  }
}

/**
 * Generates and downloads a PDF "certificate" summarizing `will`'s public,
 * on-chain terms, with a QR code and link back to `verifyUrl` for
 * independent confirmation. Only ever reads fields already present on
 * `Will` (all public contract state) — never private keys or signing
 * material, which this app never has access to in the first place.
 *
 * Throws `CertificateExportError` if any stage of generation fails, so callers
 * can tell the user the export did not succeed instead of failing silently.
 */
export async function downloadWillCertificate(will: Will, verifyUrl: string): Promise<void> {
  let qrDataUrl: string;
  try {
    qrDataUrl = await generateQrDataUrl(verifyUrl);
  } catch (err) {
    throw new CertificateExportError('Could not generate the verification QR code for the certificate.', {
      cause: err,
    });
  }
  if (!qrDataUrl.startsWith('data:image/png')) {
    throw new CertificateExportError('Could not generate the verification QR code for the certificate.');
  }

  let doc: jsPDF;
  try {
    doc = buildCertificatePdf(will, verifyUrl, qrDataUrl);
  } catch (err) {
    throw new CertificateExportError('Could not generate the certificate PDF.', { cause: err });
  }

  // jsPDF can produce an empty document without throwing (e.g. on a bad
  // image); check there is real output before handing it to the browser.
  // Some builds/test doubles expose `save` without `output`, so only run the
  // emptiness check when the document can actually be serialized.
  if (typeof doc.output === 'function') {
    const pdfSize = doc.output('arraybuffer').byteLength;
    if (pdfSize === 0) {
      throw new CertificateExportError('The generated certificate PDF was empty.');
    }
  }

  try {
    doc.save(`sorowill-${will.id}-certificate.pdf`);
  } catch (err) {
    throw new CertificateExportError('Could not save the certificate PDF.', { cause: err });
  }
}

function buildCertificatePdf(will: Will, verifyUrl: string, qrDataUrl: string): jsPDF {

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 56;
  const marginTop = 64;
  const marginBottom = 64;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text('SoroWill Certificate', marginX, y);
  y += 26;

  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(
    "A snapshot of this will's on-chain terms, generated for reference. Independently verifiable at the link below.",
    marginX,
    y,
    { maxWidth: 480 },
  );
  y += 36;

  doc.setTextColor(20);
  doc.setFontSize(13);
  const lines: string[] = [
    `Will ID: ${will.id}`,
    `Owner: ${will.owner}`,
    `Status: ${will.status}`,
    `Locked balance: ${formatUSDC(BigInt(will.balance))} USDC`,
    `Check-in period: ${will.checkinPeriodDays} day${will.checkinPeriodDays === 1 ? '' : 's'}`,
    `Grace period: ${will.gracePeriodDays} day${will.gracePeriodDays === 1 ? '' : 's'}`,
    `Check-in deadline: ${formatDeadline(nextCheckinDeadline(will))}`,
  ];
  if ('createdAt' in will) {
    const createdAt = parseCreationDate(will.createdAt);
    if (createdAt) {
      lines.splice(2, 0, `Will created: ${formatDeadline(createdAt)}`);
    }
  }
  for (const line of lines) {
    ensureSpace(20);
    doc.text(line, marginX, y);
    y += 20;
  }
  y += 12;

  ensureSpace(20);
  doc.setFontSize(14);
  doc.text('Beneficiaries', marginX, y);
  y += 20;
  doc.setFontSize(11);
  for (const beneficiary of will.beneficiaries) {
    ensureSpace(18);
    doc.text(`${beneficiary.address} — ${beneficiary.percentage}%`, marginX, y);
    y += 18;
  }
  y += 24;

  const qrSize = 110;
  ensureSpace(qrSize);
  doc.addImage(qrDataUrl, 'PNG', marginX, y, qrSize, qrSize);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text('Scan to verify, or visit:', marginX + qrSize + 16, y + 44);
  doc.setTextColor(79, 70, 229);
  doc.textWithLink(verifyUrl, marginX + qrSize + 16, y + 60, { url: verifyUrl });

  return doc;
}
