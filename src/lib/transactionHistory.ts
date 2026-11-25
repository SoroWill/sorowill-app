/**
 * Transaction history (#891): the connected wallet's transactions from Horizon, with search,
 * type filters and CSV export.
 */
import { getNetwork, getContractId } from '@/lib/sorowill';

export type TransactionType = 'contract-call' | 'payment' | 'account' | 'other';

export interface HistoryTransaction {
  /** Horizon operation id. */
  id: string;
  hash: string;
  createdAt: string;
  type: TransactionType;
  /** Horizon operation type, e.g. `invoke_host_function`, `payment`. */
  operation: string;
  successful: boolean;
  /** Decimal amount moved, when the operation moved one asset. */
  amount: string | null;
  asset: string | null;
  /** True when the operation called the SoroWill contract. */
  sorowill: boolean;
}

export interface HistoryFilter {
  /** Matches transaction hash or operation id (case-insensitive, substring). */
  query?: string;
  /** Inclusive ISO date (YYYY-MM-DD) bounds. */
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  type?: TransactionType | 'all';
  sorowillOnly?: boolean;
}

interface HorizonOperation {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful?: boolean;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  starting_balance?: string;
  function?: string;
  parameters?: { value: string; type: string }[];
  asset_balance_changes?: { amount: string; asset_type: string; asset_code?: string }[];
}

const PAYMENT_TYPES = new Set(['payment', 'path_payment_strict_send', 'path_payment_strict_receive']);
const ACCOUNT_TYPES = new Set(['create_account', 'change_trust', 'set_options', 'account_merge']);

function horizonUrl(): string {
  return getNetwork() === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
}

function assetName(type?: string, code?: string): string | null {
  if (!type) return null;
  return type === 'native' ? 'XLM' : code ?? null;
}

/** Converts a Horizon operation record into a history row. */
export function toHistoryTransaction(op: HorizonOperation, contractId = ''): HistoryTransaction {
  const change = op.asset_balance_changes?.[0];
  const type: TransactionType =
    op.type === 'invoke_host_function'
      ? 'contract-call'
      : PAYMENT_TYPES.has(op.type)
        ? 'payment'
        : ACCOUNT_TYPES.has(op.type)
          ? 'account'
          : 'other';
  const sorowill =
    op.type === 'invoke_host_function' &&
    contractId !== '' &&
    JSON.stringify(op.parameters ?? []).includes(contractId);
  return {
    id: op.id,
    hash: op.transaction_hash,
    createdAt: op.created_at,
    type,
    operation: op.type,
    successful: op.transaction_successful !== false,
    amount: op.amount ?? op.starting_balance ?? change?.amount ?? null,
    asset: op.amount || op.starting_balance ? assetName(op.asset_type ?? 'native', op.asset_code) : assetName(change?.asset_type, change?.asset_code),
    sorowill,
  };
}

/**
 * Fetches up to `limit` most recent operations for `account`. Horizon is queried with
 * `include_failed=true` so failed transactions show up too (marked `successful: false`).
 */
export async function fetchTransactionHistory(
  account: string,
  options: { limit?: number; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<HistoryTransaction[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 200);
  const url = `${horizonUrl()}/accounts/${account}/operations?order=desc&limit=${limit}&join=transactions&include_failed=true`;
  const res = await fetchImpl(url, { signal: options.signal });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Horizon returned HTTP ${res.status}`);
  const body = (await res.json()) as { _embedded?: { records?: HorizonOperation[] } };
  let contractId = '';
  try {
    contractId = getContractId();
  } catch {
    // No contract configured: nothing is marked as a SoroWill call.
  }
  return (body._embedded?.records ?? []).map((op) => toHistoryTransaction(op, contractId));
}

export function filterTransactions(list: HistoryTransaction[], filter: HistoryFilter): HistoryTransaction[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return list.filter((tx) => {
    if (q && !tx.hash.toLowerCase().includes(q) && !tx.id.includes(q)) return false;
    const day = tx.createdAt.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.minAmount !== undefined || filter.maxAmount !== undefined) {
      if (tx.amount === null) return false;
      const amount = Math.abs(Number(tx.amount));
      if (filter.minAmount !== undefined && amount < filter.minAmount) return false;
      if (filter.maxAmount !== undefined && amount > filter.maxAmount) return false;
    }
    if (filter.type && filter.type !== 'all' && tx.type !== filter.type) return false;
    if (filter.sorowillOnly && !tx.sorowill) return false;
    return true;
  });
}

function csvField(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportTransactionsToCSV(list: HistoryTransaction[]): string {
  const header = ['date', 'transaction_hash', 'operation_id', 'type', 'operation', 'amount', 'asset', 'successful', 'sorowill'];
  const rows = list.map((tx) =>
    [tx.createdAt, tx.hash, tx.id, tx.type, tx.operation, tx.amount, tx.asset, tx.successful, tx.sorowill].map(csvField).join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}
