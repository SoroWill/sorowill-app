import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CSV_BENEFICIARIES, parseBeneficiaryCsv, splitCsvLine } from '@/lib/beneficiaryCsv';
import {
  allTags,
  exportAddressBook,
  importAddressBook,
  loadAddressBook,
  removeAddress,
  searchAddressBook,
  upsertAddress,
} from '@/lib/addressBook';
import {
  BUILT_IN_TEMPLATES,
  decodeTemplate,
  encodeTemplate,
  loadCustomTemplates,
  saveCustomTemplate,
  validateTemplate,
} from '@/lib/willTemplates';
import { exportTransactionsToCSV, filterTransactions, toHistoryTransaction, type HistoryTransaction } from '@/lib/transactionHistory';
import { BeneficiaryCsvImport } from '@/components/BeneficiaryCsvImport';
import { AddressBookManager, AddressBookPicker } from '@/components/AddressBook';
import { WillTemplatePicker } from '@/components/WillTemplatePicker';
import { TransactionHistory } from '@/components/TransactionHistory';

const A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const B = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('CSV beneficiary import (#887)', () => {
  it('parses quoted fields and an optional header', () => {
    expect(splitCsvLine('"G…, quoted",50,"Sis ""A"""')).toEqual(['G…, quoted', '50', 'Sis "A"']);
    const result = parseBeneficiaryCsv(`address,percentage,label\n${A},60,Alice\n${B},40%\n`);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { line: 2, address: A, percentage: 60, label: 'Alice' },
      { line: 3, address: B, percentage: 40 },
    ]);
    expect(result.total).toBe(100);
    expect(result.warnings).toEqual([]);
  });

  it('reports each invalid line and a total that is not 100%', () => {
    const result = parseBeneficiaryCsv(`${A},50\nnot-an-address,20\n${B},12.5\n${A},10\n${B}\n${B},30`);
    expect(result.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(result.errors[0].message).toMatch(/not a valid Stellar address/);
    expect(result.errors[1].message).toMatch(/whole numbers/);
    expect(result.errors[2].message).toMatch(/Duplicate address \(also on line 1\)/);
    expect(result.total).toBe(80);
    expect(result.warnings[0].message).toMatch(/add up to 80%/);
  });

  it('rejects empty files and too many rows', () => {
    expect(parseBeneficiaryCsv('\n\n').errors[0].message).toMatch(/no beneficiary rows/);
    const many = Array.from({ length: MAX_CSV_BENEFICIARIES + 1 }, (_, i) => `${i % 2 ? A : B},1`).join('\n');
    expect(parseBeneficiaryCsv(many).errors.some((e) => e.line === 0)).toBe(true);
  });

  it('previews a file and imports only when there are no errors', async () => {
    const onImport = vi.fn();
    const { container } = render(<BeneficiaryCsvImport onImport={onImport} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const bad = new File([`${A},50\nbad,50`], 'bad.csv', { type: 'text/csv' });
    await act(async () => fireEvent.change(input, { target: { files: [bad] } }));
    expect(await screen.findByText('Line 2: "bad" is not a valid Stellar address.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Import 1 beneficiary/ }) as HTMLButtonElement).disabled).toBe(true);

    const good = new File([`${A},60\n${B},40`], 'good.csv', { type: 'text/csv' });
    await act(async () => fireEvent.change(input, { target: { files: [good] } }));
    const button = await screen.findByRole('button', { name: /Import 2 beneficiaries/ });
    expect(screen.getByRole('table', { name: 'Import preview' })).toBeTruthy();
    fireEvent.click(button);
    expect(onImport).toHaveBeenCalledWith([
      { address: A, percentage: 60 },
      { address: B, percentage: 40 },
    ]);
  });
});

describe('address book (#888)', () => {
  it('saves, updates, tags, searches and removes entries', () => {
    let { entries, error } = upsertAddress([], { address: A.toLowerCase(), label: 'Sister', tags: ['Family', 'family', ' Guardian '] });
    expect(error).toBeUndefined();
    expect(entries[0]).toMatchObject({ address: A, label: 'Sister', tags: ['family', 'guardian'] });
    ({ entries } = upsertAddress(entries, { address: B, label: 'Lawyer', tags: ['legal'] }));
    ({ entries } = upsertAddress(entries, { address: A, label: 'Big sister', tags: ['family'] }));
    expect(entries).toHaveLength(2);
    expect(loadAddressBook().find((e) => e.address === A)?.label).toBe('Big sister');
    expect(allTags(entries)).toEqual(['family', 'legal']);
    expect(searchAddressBook(entries, 'law').map((e) => e.label)).toEqual(['Lawyer']);
    expect(searchAddressBook(entries, '', 'family').map((e) => e.label)).toEqual(['Big sister']);
    expect(removeAddress(entries, B)).toHaveLength(1);
    expect(upsertAddress([], { address: 'nope', label: 'x' }).error).toMatch(/valid Stellar address/);
    expect(upsertAddress([], { address: A, label: ' ' }).error).toMatch(/label/);
  });

  it('exports and merges imports by address, newest edit winning', () => {
    const old = upsertAddress([], { address: A, label: 'Old' }, new Date('2026-01-01')).entries;
    const newer = upsertAddress([], { address: A, label: 'New' }, new Date('2026-02-01')).entries;
    const withB = upsertAddress(newer, { address: B, label: 'B' }, new Date('2026-02-01')).entries;
    const merged = importAddressBook(old, exportAddressBook(withB));
    expect(merged).toMatchObject({ added: 1, updated: 1 });
    expect(merged.entries.find((e) => e.address === A)?.label).toBe('New');
    expect(importAddressBook(merged.entries, exportAddressBook(withB))).toMatchObject({ added: 0, updated: 0 });
    expect(importAddressBook([], '{bad').error).toMatch(/not valid JSON/);
  });

  it('manager saves an address and the picker fills it into a form', async () => {
    render(<AddressBookManager />);
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: A } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Mum' } });
    fireEvent.change(screen.getByLabelText('Tags (comma separated)'), { target: { value: 'family' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('Address saved.')).toBeTruthy();

    const onPick = vi.fn();
    render(<AddressBookPicker onPick={onPick} label="Pick" />);
    fireEvent.click(await screen.findByRole('button', { name: `Use Mum (${A})` }));
    expect(onPick).toHaveBeenCalledWith(A);
  });
});

describe('will templates (#890)', () => {
  it('ships valid built-in templates', () => {
    for (const t of BUILT_IN_TEMPLATES) expect(validateTemplate(t)).toEqual([]);
  });

  it('validates, saves (replacing by name) and loads custom templates', () => {
    const base = { name: 'Mine', description: '', checkinPeriodDays: 30, gracePeriodDays: 3 };
    expect(saveCustomTemplate({ ...base, shares: [{ label: 'A', percentage: 70 }] })[0]).toMatch(/add up to 100%/);
    expect(saveCustomTemplate({ ...base, shares: [{ label: 'A', percentage: 100 }] }, () => 'c1')).toEqual([]);
    expect(saveCustomTemplate({ ...base, name: ' mine ', shares: [{ label: 'A', percentage: 60 }, { label: 'B', percentage: 40 }] })).toEqual([]);
    const saved = loadCustomTemplates();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'c1', shares: [{ label: 'A', percentage: 60 }, { label: 'B', percentage: 40 }] });
  });

  it('round-trips a template through a share link and rejects tampered ones', () => {
    const t = BUILT_IN_TEMPLATES[2];
    const decoded = decodeTemplate(encodeTemplate(t));
    expect(decoded).toMatchObject({ name: t.name, shares: t.shares, checkinPeriodDays: t.checkinPeriodDays });
    expect(decodeTemplate('not-base64!!')).toBeNull();
    const tampered = encodeTemplate({ ...t, shares: [{ label: 'x', percentage: 150 }] });
    expect(decodeTemplate(tampered)).toBeNull();
  });

  it('applies a template and saves the current form as one', async () => {
    const onApply = vi.fn();
    render(
      <WillTemplatePicker
        onApply={onApply}
        current={{ shares: [{ label: 'Beneficiary 1', percentage: 100 }], checkinPeriodDays: 60, gracePeriodDays: 5 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use template Two equal heirs' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'two-equal' }));

    fireEvent.change(screen.getByLabelText(/Save the current shares/), { target: { value: 'Draft A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('button', { name: 'Use template Draft A' })).toBeTruthy();
    expect(loadCustomTemplates()[0]).toMatchObject({ name: 'Draft A', checkinPeriodDays: 60, gracePeriodDays: 5 });
  });
});

describe('transaction history (#891)', () => {
  const tx = (over: Partial<HistoryTransaction>): HistoryTransaction => ({
    id: '1',
    hash: 'abc',
    createdAt: '2026-03-01T10:00:00Z',
    type: 'payment',
    operation: 'payment',
    successful: true,
    amount: '10.0000000',
    asset: 'XLM',
    sorowill: false,
    ...over,
  });
  const list = [
    tx({ id: '1', hash: 'aaa111', createdAt: '2026-01-05T00:00:00Z', amount: '5' }),
    tx({ id: '2', hash: 'bbb222', createdAt: '2026-02-10T00:00:00Z', amount: '50', type: 'contract-call', sorowill: true }),
    tx({ id: '3', hash: 'ccc333', createdAt: '2026-03-15T00:00:00Z', amount: null, type: 'account', operation: 'change_trust' }),
  ];

  it('maps Horizon operations, including contract calls with balance changes', () => {
    const call = toHistoryTransaction(
      {
        id: '9',
        type: 'invoke_host_function',
        created_at: '2026-01-01T00:00:00Z',
        transaction_hash: 'h',
        transaction_successful: false,
        parameters: [{ type: 'Address', value: 'CONTRACTXYZ' }],
        asset_balance_changes: [{ amount: '12.5', asset_type: 'credit_alphanum4', asset_code: 'USDC' }],
      },
      'CONTRACTXYZ',
    );
    expect(call).toMatchObject({ type: 'contract-call', amount: '12.5', asset: 'USDC', successful: false, sorowill: true });
    const pay = toHistoryTransaction({ id: '8', type: 'payment', created_at: 'x', transaction_hash: 'p', amount: '3', asset_type: 'native' });
    expect(pay).toMatchObject({ type: 'payment', amount: '3', asset: 'XLM', successful: true });
  });

  it('searches by ID, date range, amount and type', () => {
    expect(filterTransactions(list, { query: 'BBB' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTransactions(list, { from: '2026-02-01', to: '2026-02-28' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTransactions(list, { minAmount: 10 }).map((t) => t.id)).toEqual(['2']);
    expect(filterTransactions(list, { type: 'account' }).map((t) => t.id)).toEqual(['3']);
    expect(filterTransactions(list, { sorowillOnly: true }).map((t) => t.id)).toEqual(['2']);
  });

  it('exports CSV with escaped fields', () => {
    const csv = exportTransactionsToCSV([tx({ asset: 'A,B' })]);
    expect(csv.split('\n')[0]).toBe('date,transaction_hash,operation_id,type,operation,amount,asset,successful,sorowill');
    expect(csv).toContain('"A,B"');
  });

  it('lists, filters and reports load errors', async () => {
    const load = vi.fn().mockResolvedValue(list);
    render(<TransactionHistory account={A} load={load} />);
    expect(await screen.findByText('Showing 3 of 3 recent operations.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'contract-call' } });
    await waitFor(() => expect(screen.getByText('Showing 1 of 3 recent operations.')).toBeTruthy());

    const failing = vi.fn().mockRejectedValue(new Error('HTTP 500'));
    render(<TransactionHistory account={B} load={failing} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/HTTP 500/);
  });
});
