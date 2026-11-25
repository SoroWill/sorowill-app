import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WillStatus, type Will } from '@sorowill/sdk';

import {
  clearFormSuggestions,
  equalShares,
  recordWillFormUsage,
  suggestAddresses,
  suggestSplits,
} from '@/lib/formSuggestions';
import { diffWillVersions, loadWillVersions, recordWillVersion, snapshotWill } from '@/lib/willVersions';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  validateNotificationPrefs,
} from '@/lib/notificationPrefs';
import { evaluateBeneficiaryAccount, verifyBeneficiaryAccount } from '@/lib/beneficiaryVerification';
import { AddressSuggestions, SplitSuggestions } from '@/components/FormSuggestions';
import { WillVersionHistory } from '@/components/WillVersionHistory';
import { BeneficiaryAccountCheck, BeneficiaryNotificationPrefs } from '@/components/BeneficiaryPanels';

const A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const C = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: '7',
    owner: A,
    token: 'CCV4OUCZ5TTB3ZLWHJQQZDXHMPNGR65EQ3GLBJ7KX6HLRHOFCJZ4Q4XU',
    balance: '1000',
    beneficiaries: [
      { address: B, percentage: 50 },
      { address: C, percentage: 50 },
    ],
    checkinPeriodDays: 30,
    gracePeriodDays: 7,
    lastCheckin: new Date(),
    triggerTime: null,
    status: WillStatus.Active,
    guardians: [],
    guardianVotes: 0,
    ...overrides,
  } as Will;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('form suggestions (#882)', () => {
  it('offers equal and standard splits that sum to 100', () => {
    expect(equalShares(3).reduce((a, b) => a + b, 0)).toBe(100);
    const splits = suggestSplits(2);
    expect(splits[0].percentages).toEqual([50, 50]);
    expect(splits.map((s) => s.percentages)).toContainEqual([70, 30]);
    expect(suggestSplits(1)).toEqual([]);
  });

  it('learns splits and addresses from submitted wills', () => {
    recordWillFormUsage({
      beneficiaries: [
        { address: B, percentage: 80 },
        { address: C, percentage: 20 },
      ],
      guardians: [A],
    });
    expect(suggestSplits(2)[0]).toEqual({ label: '80% / 20% (used before)', percentages: [80, 20] });
    expect(suggestAddresses('beneficiaries')).toEqual([B, C]);
    expect(suggestAddresses('beneficiaries', [B])).toEqual([C]);
    expect(suggestAddresses('guardians')).toEqual([A]);
    clearFormSuggestions();
    expect(suggestAddresses('guardians')).toEqual([]);
  });

  it('renders chips that apply a split or pick an address', async () => {
    recordWillFormUsage({ beneficiaries: [{ address: B, percentage: 100 }] });
    const onApply = vi.fn();
    const onPick = vi.fn();
    render(
      <>
        <SplitSuggestions count={2} onApply={onApply} />
        <AddressSuggestions kind="beneficiaries" label="Recent beneficiaries" exclude={[]} onPick={onPick} />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '60% / 40%' }));
    expect(onApply).toHaveBeenCalledWith([60, 40]);
    fireEvent.click(screen.getByRole('button', { name: `Use ${B}` }));
    expect(onPick).toHaveBeenCalledWith(B);
  });
});

describe('will versions (#885)', () => {
  it('records only changed versions and diffs them', () => {
    const first = makeWill();
    recordWillVersion(first, 1000);
    recordWillVersion(first, 2000);
    expect(loadWillVersions('7')).toHaveLength(1);

    const second = makeWill({
      checkinPeriodDays: 60,
      beneficiaries: [
        { address: B, percentage: 70 },
        { address: A, percentage: 30 },
      ],
    });
    const history = recordWillVersion(second, 3000);
    expect(history).toHaveLength(2);

    const diff = diffWillVersions(snapshotWill(first, 1), snapshotWill(second, 2));
    expect(diff.fields).toEqual([
      { field: 'checkinPeriodDays', label: 'Check-in period (days)', before: '30', after: '60' },
    ]);
    expect(diff.beneficiaries).toEqual(
      expect.arrayContaining([
        { kind: 'changed', address: B, before: 50, after: 70 },
        { kind: 'removed', address: C, before: 50 },
        { kind: 'added', address: A, after: 30 },
      ]),
    );
  });

  it('shows highlighted differences and reverts beneficiaries into the form', async () => {
    recordWillVersion(makeWill(), Date.UTC(2026, 0, 1));
    const onRevert = vi.fn();
    render(
      <WillVersionHistory
        will={makeWill({ beneficiaries: [{ address: B, percentage: 100 }] })}
        onRevert={onRevert}
        canRevert
      />,
    );
    expect(await screen.findByText('Compare versions')).toBeTruthy();
    expect(document.querySelector('[data-change="removed"]')).toBeTruthy();
    expect(document.querySelector('[data-change="changed"]')).toBeTruthy();
    expect(screen.getAllByText(/2026-01-01 00:00 UTC/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Revert beneficiaries/ }));
    expect(onRevert).toHaveBeenCalledWith([
      { address: B, percentage: 50 },
      { address: C, percentage: 50 },
    ]);
  });
});

describe('beneficiary notification preferences (#886)', () => {
  it('validates channels, email and events when opted in', () => {
    expect(validateNotificationPrefs(DEFAULT_NOTIFICATION_PREFS)).toEqual([]);
    const enabled = { ...DEFAULT_NOTIFICATION_PREFS, enabled: true };
    expect(validateNotificationPrefs(enabled)).toEqual([]);
    expect(validateNotificationPrefs({ ...enabled, channels: { inApp: false, email: false } })).toContain(
      'Choose at least one delivery method.',
    );
    expect(validateNotificationPrefs({ ...enabled, channels: { inApp: false, email: true }, email: 'nope' })).toContain(
      'Enter a valid email address.',
    );
    expect(
      validateNotificationPrefs({
        ...enabled,
        events: { statusChange: false, checkinMissed: false, readyToClaim: false },
      }),
    ).toContain('Choose at least one event to be notified about.');
  });

  it('saves per wallet and will', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, enabled: true, frequency: 'weekly' as const };
    expect(saveNotificationPrefs(B, '7', prefs)).toEqual([]);
    expect(loadNotificationPrefs(B, '7').frequency).toBe('weekly');
    expect(loadNotificationPrefs(B, '8')).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(loadNotificationPrefs(C, '7')).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('lets a beneficiary opt in and choose frequency and channels', async () => {
    render(<BeneficiaryNotificationPrefs wallet={B} willId="7" />);
    fireEvent.click(screen.getByLabelText('Notify me about this will'));
    fireEvent.click(screen.getByLabelText('Daily digest'));
    fireEvent.click(screen.getByLabelText('Email'));
    fireEvent.change(screen.getByLabelText('Email address for notifications'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid email address.');

    fireEvent.change(screen.getByLabelText('Email address for notifications'), { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect(await screen.findByText('Preferences saved.')).toBeTruthy();
    expect(loadNotificationPrefs(B, '7')).toMatchObject({
      enabled: true,
      frequency: 'daily',
      channels: { inApp: true, email: true },
      email: 'me@example.com',
    });
  });
});

describe('beneficiary account verification (#889)', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const old = new Date('2025-01-01T00:00:00Z');
  const usdc = (extra: Record<string, unknown> = {}) => ({
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: 'GISSUER',
    balance: '10',
    limit: '1000',
    is_authorized: true,
    ...extra,
  });
  const statuses = (checks: { id: string; status: string }[]) =>
    Object.fromEntries(checks.map((c) => [c.id, c.status]));

  it('fails a missing account with a suggestion', () => {
    const [check] = evaluateBeneficiaryAccount(null, { amountUsdc: 5, firstActivityAt: null, now });
    expect(check).toMatchObject({ id: 'exists', status: 'fail' });
    expect(check.suggestion).toMatch(/Fund the address/);
  });

  it('passes a ready account', () => {
    const checks = evaluateBeneficiaryAccount(
      { balances: [{ asset_type: 'native', balance: '5' }, usdc()], subentry_count: 1 },
      { amountUsdc: 100, usdcIssuer: 'GISSUER', firstActivityAt: old, now },
    );
    expect(checks.every((c) => c.status === 'ok')).toBe(true);
  });

  it('flags missing trustline, low XLM and new accounts', () => {
    const checks = evaluateBeneficiaryAccount(
      { balances: [{ asset_type: 'native', balance: '1' }], subentry_count: 0 },
      { amountUsdc: 1, firstActivityAt: new Date('2026-05-30T00:00:00Z'), now },
    );
    expect(statuses(checks)).toEqual({ exists: 'ok', reserve: 'warn', trustline: 'fail', history: 'warn' });
  });

  it('flags unauthorized trustlines, a wrong issuer and too little room', () => {
    const unauthorized = evaluateBeneficiaryAccount(
      { balances: [{ asset_type: 'native', balance: '5' }, usdc({ is_authorized: false, limit: '50' })] },
      { amountUsdc: 100, firstActivityAt: old, now },
    );
    expect(statuses(unauthorized)).toMatchObject({ authorized: 'fail', capacity: 'fail' });

    const wrongIssuer = evaluateBeneficiaryAccount(
      { balances: [{ asset_type: 'native', balance: '5' }, usdc({ asset_issuer: 'GOTHER' })] },
      { amountUsdc: 1, usdcIssuer: 'GISSUER', firstActivityAt: old, now },
    );
    expect(statuses(wrongIssuer).trustline).toBe('fail');
  });

  it('treats a Horizon 404 as a missing account and reads first activity', async () => {
    const notFound = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    expect((await verifyBeneficiaryAccount(B, 1, { fetchImpl: notFound }))[0]).toMatchObject({ status: 'fail' });

    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/operations')
        ? Response.json({ _embedded: { records: [{ created_at: '2020-01-01T00:00:00Z' }] } })
        : Response.json({ balances: [{ asset_type: 'native', balance: '5' }, usdc()], subentry_count: 1 }),
    ) as unknown as typeof fetch;
    const checks = await verifyBeneficiaryAccount(B, 1, { fetchImpl });
    expect(checks.find((c) => c.id === 'history')?.status).toBe('ok');
  });

  it('shows a warning with suggestions before claiming', async () => {
    const verify = vi.fn().mockResolvedValue(
      evaluateBeneficiaryAccount({ balances: [{ asset_type: 'native', balance: '5' }] }, {
        amountUsdc: 1,
        firstActivityAt: old,
        now,
      }),
    );
    await act(async () => {
      render(<BeneficiaryAccountCheck address={B} amountUsdc={1} verify={verify} />);
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/may not be able to receive/));
    expect(screen.getByText(/Add a USDC trustline/)).toBeTruthy();
  });
});
