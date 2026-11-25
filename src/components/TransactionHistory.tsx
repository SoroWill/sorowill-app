'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  exportTransactionsToCSV,
  fetchTransactionHistory,
  filterTransactions,
  type HistoryTransaction,
  type TransactionType,
} from '@/lib/transactionHistory';
import { stellarExpertUrl } from '@/lib/sorowill';

const TYPE_LABELS: Record<TransactionType | 'all', string> = {
  all: 'All types',
  'contract-call': 'Contract calls',
  payment: 'Payments',
  account: 'Account changes',
  other: 'Other',
};

/** The wallet's transaction list with search, filters and CSV export (#891). */
export function TransactionHistory({
  account,
  load = fetchTransactionHistory,
}: {
  account: string;
  load?: typeof fetchTransactionHistory;
}) {
  const [transactions, setTransactions] = useState<HistoryTransaction[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [type, setType] = useState<TransactionType | 'all'>('all');
  const [sorowillOnly, setSorowillOnly] = useState(false);
  const ids = { q: useId(), from: useId(), to: useId(), min: useId(), max: useId(), type: useId() };

  useEffect(() => {
    const controller = new AbortController();
    setTransactions(null);
    setError('');
    load(account, { signal: controller.signal })
      .then(setTransactions)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load transactions');
      });
    return () => controller.abort();
  }, [account, load]);

  const visible = useMemo(
    () =>
      filterTransactions(transactions ?? [], {
        query,
        from: from || undefined,
        to: to || undefined,
        minAmount: minAmount === '' ? undefined : Number(minAmount),
        maxAmount: maxAmount === '' ? undefined : Number(maxAmount),
        type,
        sorowillOnly,
      }),
    [transactions, query, from, to, minAmount, maxAmount, type, sorowillOnly],
  );

  function handleExport() {
    const blob = new Blob([exportTransactionsToCSV(visible)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sorowill-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const input = 'mt-1 w-full rounded border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light';

  return (
    <section aria-label="Transaction history" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-will-light">Transaction history</h2>
        <button type="button" onClick={handleExport} disabled={visible.length === 0} className="rounded-full border border-white/20 px-3 py-1 text-xs text-will-light/80 disabled:opacity-40">
          Export CSV
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label htmlFor={ids.q} className="text-xs text-will-light/70 sm:col-span-2">
          Transaction or operation ID
          <input id={ids.q} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hash or ID" className={input} />
        </label>
        <label htmlFor={ids.from} className="text-xs text-will-light/70">
          From
          <input id={ids.from} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label htmlFor={ids.to} className="text-xs text-will-light/70">
          To
          <input id={ids.to} type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
        <label htmlFor={ids.min} className="text-xs text-will-light/70">
          Min amount
          <input id={ids.min} type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className={input} />
        </label>
        <label htmlFor={ids.max} className="text-xs text-will-light/70">
          Max amount
          <input id={ids.max} type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label htmlFor={ids.type} className="text-xs text-will-light/70">
          Type{' '}
          <select id={ids.type} value={type} onChange={(e) => setType(e.target.value as TransactionType | 'all')} className="rounded border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light">
            {(Object.keys(TYPE_LABELS) as (TransactionType | 'all')[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-will-light/70">
          <input type="checkbox" checked={sorowillOnly} onChange={(e) => setSorowillOnly(e.target.checked)} />
          SoroWill contract only
        </label>
      </div>

      {error ? <p role="alert" className="text-xs text-red-300">Could not load transactions: {error}</p> : null}
      {!transactions && !error ? <p className="text-xs text-will-light/60">Loading transactions…</p> : null}

      {transactions ? (
        <>
          <p className="text-xs text-will-light/50">
            Showing {visible.length} of {transactions.length} recent operations.
          </p>
          <table className="w-full text-left text-xs" aria-label="Transactions">
            <thead>
              <tr className="text-will-light/50">
                <th scope="col" className="py-1">Date</th>
                <th scope="col" className="py-1">Type</th>
                <th scope="col" className="py-1">Amount</th>
                <th scope="col" className="py-1">Transaction</th>
                <th scope="col" className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((tx) => (
                <tr key={tx.id} className="border-t border-white/5">
                  <td className="py-1">{tx.createdAt.replace('T', ' ').replace('Z', ' UTC')}</td>
                  <td className="py-1">
                    {TYPE_LABELS[tx.type]}
                    {tx.sorowill ? <span className="ml-1 text-will-purple">· SoroWill</span> : null}
                  </td>
                  <td className="py-1">{tx.amount !== null ? `${tx.amount} ${tx.asset ?? ''}` : '—'}</td>
                  <td className="py-1 font-mono">
                    <a href={stellarExpertUrl('tx', tx.hash)} target="_blank" rel="noopener noreferrer" className="underline" title={tx.hash}>
                      {tx.hash.slice(0, 10)}…
                    </a>
                  </td>
                  <td className={`py-1 ${tx.successful ? 'text-emerald-300' : 'text-red-300'}`}>{tx.successful ? 'Success' : 'Failed'}</td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-2 text-will-light/50">No transactions match these filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
