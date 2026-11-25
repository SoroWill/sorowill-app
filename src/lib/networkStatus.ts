/**
 * Network status monitor (#896).
 *
 * Polls the Soroban RPC for the latest ledger and derives a health verdict,
 * a fee (gas price) trend and an estimated transaction speed. Everything here
 * is pure except {@link fetchNetworkStatus}, so the classification logic can be
 * reasoned about without a network.
 */

export type NetworkHealth = 'healthy' | 'degraded' | 'offline';

export type FeeTrend = 'rising' | 'falling' | 'stable';

export interface LedgerInfo {
  /** Latest closed ledger sequence number. */
  sequence: number;
  /** Close time of the latest ledger, in milliseconds since the epoch. */
  closedAt: number;
  /** Base fee in stroops per operation, as reported by the RPC. */
  baseFeeInStroops: number;
}

export interface NetworkStatus {
  health: NetworkHealth;
  /** Ledger close time in seconds; `null` when unknown. */
  ledgerCloseSeconds: number | null;
  /** Estimated confirmation time for a transaction, in seconds. */
  transactionSpeedSeconds: number | null;
  /** Current base fee in stroops per operation. */
  baseFeeInStroops: number | null;
  /** Change in base fee versus the previous sample, as a percentage. */
  feeChangePercent: number | null;
  feeTrend: FeeTrend;
  /** Human-readable warnings; empty when everything looks fine. */
  warnings: string[];
  /** Error message when the RPC could not be reached. */
  error?: string;
}

/** Ledgers slower than this are reported as degraded. */
export const SLOW_LEDGER_CLOSE_SECONDS = 10;
/** Fee swings beyond this percentage are reported as a trend. */
export const FEE_TREND_THRESHOLD_PERCENT = 10;
/** Fee swings beyond this percentage trigger a warning. */
export const FEE_WARNING_THRESHOLD_PERCENT = 100;
const STATUS_TIMEOUT_MS = 5_000;

/** Classifies a fee change as rising, falling or stable. */
export function classifyFeeTrend(changePercent: number | null): FeeTrend {
  if (changePercent === null || Math.abs(changePercent) < FEE_TREND_THRESHOLD_PERCENT) {
    return 'stable';
  }
  return changePercent > 0 ? 'rising' : 'falling';
}

/** Percentage change from `previous` to `current`; `null` when not comparable. */
export function feeChangePercent(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Builds a status snapshot from the latest ledger sample and the previous
 * base fee. `previousBaseFee` is `null` on the first sample.
 */
export function buildNetworkStatus(
  ledger: LedgerInfo,
  previousBaseFee: number | null,
  now: number = Date.now(),
): NetworkStatus {
  const ledgerCloseSeconds = Math.max(0, (now - ledger.closedAt) / 1000);
  const change = feeChangePercent(ledger.baseFeeInStroops, previousBaseFee);
  const feeTrend = classifyFeeTrend(change);
  const warnings: string[] = [];

  if (ledgerCloseSeconds > SLOW_LEDGER_CLOSE_SECONDS) {
    warnings.push(
      `Ledger close is slow (${ledgerCloseSeconds.toFixed(1)}s since the last ledger). Transactions may take longer to confirm.`,
    );
  }
  if (change !== null && Math.abs(change) >= FEE_WARNING_THRESHOLD_PERCENT) {
    warnings.push(
      `Network fees are ${feeTrend === 'rising' ? 'rising' : 'falling'} sharply (${change > 0 ? '+' : ''}${change.toFixed(0)}%).`,
    );
  }

  return {
    health: warnings.length > 0 ? 'degraded' : 'healthy',
    ledgerCloseSeconds,
    transactionSpeedSeconds: ledgerCloseSeconds,
    baseFeeInStroops: ledger.baseFeeInStroops,
    feeChangePercent: change,
    feeTrend,
    warnings,
  };
}

/** Status snapshot for an unreachable RPC. */
export function offlineNetworkStatus(error: string): NetworkStatus {
  return {
    health: 'offline',
    ledgerCloseSeconds: null,
    transactionSpeedSeconds: null,
    baseFeeInStroops: null,
    feeChangePercent: null,
    feeTrend: 'stable',
    warnings: ['The Stellar network is unreachable. Transactions cannot be submitted right now.'],
    error,
  };
}

interface LatestLedgerResponse {
  result?: { sequence?: number; closeTime?: number; baseFeeInStroops?: number };
  error?: { message?: string };
}

/**
 * Fetches the latest ledger from the Soroban RPC and builds a status snapshot.
 * Never throws: failures are reported as an offline status.
 */
export async function fetchNetworkStatus(
  rpcUrl: string,
  previousBaseFee: number | null,
  now: number = Date.now(),
): Promise<NetworkStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
      signal: controller.signal,
    });
    if (!res.ok) return offlineNetworkStatus(`HTTP ${res.status}`);
    const body = (await res.json()) as LatestLedgerResponse;
    if (body?.error) return offlineNetworkStatus(body.error.message ?? 'RPC error');
    const sequence = body?.result?.sequence;
    const closeTime = body?.result?.closeTime;
    if (typeof sequence !== 'number' || typeof closeTime !== 'number') {
      return offlineNetworkStatus('Malformed getLatestLedger response');
    }
    return buildNetworkStatus(
      {
        sequence,
        closedAt: closeTime * 1000,
        baseFeeInStroops: body.result?.baseFeeInStroops ?? 100,
      },
      previousBaseFee,
      now,
    );
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return offlineNetworkStatus(
      aborted ? `Timed out after ${STATUS_TIMEOUT_MS}ms` : err instanceof Error ? err.message : 'Network error',
    );
  } finally {
    clearTimeout(timer);
  }
}
