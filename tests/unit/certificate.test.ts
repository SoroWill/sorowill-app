import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Will, WillStatus } from '@sorowill/sdk';

// ---------------------------------------------------------------------------
// Mock jsPDF and qrcode — we only care about the text lines the function
// writes, not the actual PDF bytes or QR image.
// ---------------------------------------------------------------------------

const textLines: string[] = [];

vi.mock('jspdf', () => {
  const mockDoc = {
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn((...args: unknown[]) => {
      // First arg is the string (or array of strings), second is x, third is y.
      const content = args[0];
      if (typeof content === 'string') textLines.push(content);
      else if (Array.isArray(content)) textLines.push(...content);
    }),
    addPage: vi.fn(),
    addImage: vi.fn(),
    textWithLink: vi.fn(),
    save: vi.fn(),
    internal: { pageSize: { getHeight: vi.fn(() => 841) } },
  };
  return { jsPDF: class { constructor() { return mockDoc; } } };
});

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock') },
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

// Mock @sorowill/sdk — we need formatDeadline and WillStatus
vi.mock('@sorowill/sdk', () => ({
  formatDeadline: (date: Date) => date.toISOString(),
  formatUSDC: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
  WillStatus: { Active: 'Active', Triggered: 'Triggered', Released: 'Released' },
}));

import { downloadWillCertificate } from '@/lib/certificate';
import { nextCheckinDeadline } from '@/lib/deadlines';

// ---------------------------------------------------------------------------
// Helper: build a minimal Will fixture.
// ---------------------------------------------------------------------------
function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: 'will-test-001',
    owner: 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4',
    token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    balance: 1_000_000n,
    beneficiaries: [
      { address: 'GDSWYNUBEHPVKWC3Q5CYRG6QZIMGR5P5ZRYSRZBCRN2VHQY7Z67HFCEF', percentage: 100 },
    ],
    guardians: [],
    guardianVotes: 0,
    status: 'Active' as WillStatus,
    lastCheckin: new Date('2026-01-01T00:00:00.000Z'),
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    triggerTime: null,
    ...overrides,
  } as Will;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('downloadWillCertificate', () => {
  beforeEach(() => {
    textLines.length = 0;
  });

  it('includes the check-in deadline whose date matches nextCheckinDeadline', async () => {
    const will = makeWill();
    const expectedDeadline = nextCheckinDeadline(will);

    await downloadWillCertificate(will, 'https://example.com/verify/will-test-001');

    // formatDeadline is mocked to return toISOString(), so we can reconstruct
    // the exact string the function should have written.
    const expectedLine = `Check-in deadline: ${expectedDeadline.toISOString()}`;
    expect(textLines).toContain(expectedLine);
  });

  it('includes the check-in deadline for non-Active wills', async () => {
    const will = makeWill({ status: 'Triggered' as WillStatus });
    const expectedDeadline = nextCheckinDeadline(will);

    await downloadWillCertificate(will, 'https://example.com/verify/will-test-001');

    expect(textLines).toContain(`Check-in deadline: ${expectedDeadline.toISOString()}`);
  });

  it('check-in deadline reflects lastCheckin + checkinPeriodDays', async () => {
    // Use a fixed lastCheckin and period so we can compute the expected Date
    // independently of the shared helper, confirming both agree.
    const lastCheckin = new Date('2026-06-01T00:00:00.000Z');
    const checkinPeriodDays = 30;
    const will = makeWill({ lastCheckin, checkinPeriodDays });

    const manualDeadline = new Date(lastCheckin.getTime() + checkinPeriodDays * 86_400 * 1000);
    const sharedDeadline = nextCheckinDeadline(will);

    // The shared helper must produce the same value as the manual calculation.
    expect(sharedDeadline.getTime()).toBe(manualDeadline.getTime());

    await downloadWillCertificate(will, 'https://example.com/verify/will-test-001');

    const expectedLine = `Check-in deadline: ${sharedDeadline.toISOString()}`;
    expect(textLines).toContain(expectedLine);
  });

  it('never writes Stellar secret-key material (docs/KEY_DERIVATION.md)', async () => {
    // SoroWill derives no keys: the certificate is built only from public
    // on-chain fields, so no StrKey secret seed (S + 55 base32 chars) may appear.
    const will = makeWill();

    await downloadWillCertificate(will, 'https://example.com/verify/will-test-001');

    expect(textLines.length).toBeGreaterThan(0);
    for (const line of textLines) {
      expect(line).not.toMatch(/\bS[A-Z2-7]{55}\b/);
    }
    expect(textLines).toContain(`Owner: ${will.owner}`);
  });
});
