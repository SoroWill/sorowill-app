import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

import { formatDeadline, formatUSDC, WillStatus, type Will } from '@sorowill/sdk';

import { nextCheckinDeadline } from '@/lib/deadlines';

/**
 * Generates and downloads a PDF "certificate" summarizing `will`'s public,
 * on-chain terms, with a QR code and link back to `verifyUrl` for
 * independent confirmation. Only ever reads fields already present on
 * `Will` (all public contract state) — never private keys or signing
 * material, which this app never has access to in the first place.
 */
export async function downloadWillCertificate(will: Will, verifyUrl: string): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240 });

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
  ];
  if (will.status === WillStatus.Active) {
    lines.push(`Next check-in due: ${formatDeadline(nextCheckinDeadline(will))}`);
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

  doc.save(`sorowill-${will.id}-certificate.pdf`);
}
