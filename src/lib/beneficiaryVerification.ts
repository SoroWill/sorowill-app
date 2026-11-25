/**
 * Checks that a beneficiary's Stellar account can actually receive its share
 * before the inheritance is released (#889): it exists, can cover fees and
 * reserves, holds an authorized USDC trustline with room for the amount, and
 * has some history. Each problem comes with a suggested fix.
 */
import { getNetwork } from '@/lib/sorowill';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface VerificationCheck {
  id: 'exists' | 'reserve' | 'trustline' | 'authorized' | 'capacity' | 'history';
  status: CheckStatus;
  label: string;
  detail: string;
  suggestion?: string;
}

interface HorizonBalance {
  balance: string;
  limit?: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  is_authorized?: boolean;
}

export interface HorizonAccountSummary {
  balances: HorizonBalance[];
  subentry_count?: number;
}

/** XLM a basic account needs (base reserve 0.5 × 2) plus room for one more entry and fees. */
const BASE_RESERVE_XLM = 0.5;
const FEE_HEADROOM_XLM = 0.5;
/** Accounts younger than this get a warning to double-check the address. */
const NEW_ACCOUNT_DAYS = 7;

export interface EvaluateOptions {
  /** Share to receive, in USDC (decimal). */
  amountUsdc: number;
  /** Expected USDC issuer; any USDC trustline is accepted when unset. */
  usdcIssuer?: string;
  /** Time of the account's first operation, or null when unknown. */
  firstActivityAt: Date | null;
  now?: Date;
}

/** Pure evaluation of a Horizon account (null when it does not exist). */
export function evaluateBeneficiaryAccount(
  account: HorizonAccountSummary | null,
  { amountUsdc, usdcIssuer, firstActivityAt, now = new Date() }: EvaluateOptions,
): VerificationCheck[] {
  if (!account) {
    return [
      {
        id: 'exists',
        status: 'fail',
        label: 'Account exists',
        detail: 'This address has no account on the network yet, so it cannot receive funds.',
        suggestion: 'Fund the address with at least 2 XLM (from an exchange or another wallet) to create the account.',
      },
    ];
  }

  const checks: VerificationCheck[] = [
    { id: 'exists', status: 'ok', label: 'Account exists', detail: 'The account is active on the network.' },
  ];

  const native = account.balances.find((b) => b.asset_type === 'native');
  const xlm = native ? Number(native.balance) : 0;
  const minimum = (2 + (account.subentry_count ?? 0)) * BASE_RESERVE_XLM + FEE_HEADROOM_XLM;
  checks.push(
    xlm >= minimum
      ? { id: 'reserve', status: 'ok', label: 'Enough XLM for fees', detail: `${xlm} XLM available.` }
      : {
          id: 'reserve',
          status: 'warn',
          label: 'Enough XLM for fees',
          detail: `Only ${xlm} XLM; about ${minimum} XLM is needed for reserves and fees.`,
          suggestion: 'Add a little XLM so the account can hold a USDC trustline and pay fees.',
        },
  );

  const usdc = account.balances.find(
    (b) => b.asset_code === 'USDC' && (!usdcIssuer || b.asset_issuer === usdcIssuer),
  );
  if (!usdc) {
    checks.push({
      id: 'trustline',
      status: 'fail',
      label: 'USDC trustline',
      detail: 'The account cannot hold USDC yet.',
      suggestion: 'Add a USDC trustline in your wallet (e.g. "Add asset" → USDC) before claiming.',
    });
  } else {
    checks.push({ id: 'trustline', status: 'ok', label: 'USDC trustline', detail: 'The account can hold USDC.' });

    checks.push(
      usdc.is_authorized === false
        ? {
            id: 'authorized',
            status: 'fail',
            label: 'Trustline authorized',
            detail: 'The USDC issuer has not authorized (or has frozen) this trustline.',
            suggestion: 'Contact the issuer or use a different account whose USDC trustline is authorized.',
          }
        : { id: 'authorized', status: 'ok', label: 'Trustline authorized', detail: 'Transfers to this trustline are allowed.' },
    );

    const room = usdc.limit !== undefined ? Number(usdc.limit) - Number(usdc.balance) : Infinity;
    checks.push(
      room >= amountUsdc
        ? { id: 'capacity', status: 'ok', label: 'Room for this amount', detail: `Can receive ${amountUsdc} USDC.` }
        : {
            id: 'capacity',
            status: 'fail',
            label: 'Room for this amount',
            detail: `The trustline limit leaves room for ${Math.max(0, room)} USDC, less than the ${amountUsdc} USDC share.`,
            suggestion: 'Raise the USDC trustline limit in your wallet (or remove the custom limit).',
          },
    );
  }

  if (!firstActivityAt) {
    checks.push({
      id: 'history',
      status: 'warn',
      label: 'Account history',
      detail: 'No account history could be found.',
      suggestion: 'Make sure this is an address you control before receiving a large amount.',
    });
  } else {
    const ageDays = (now.getTime() - firstActivityAt.getTime()) / 86_400_000;
    checks.push(
      ageDays >= NEW_ACCOUNT_DAYS
        ? { id: 'history', status: 'ok', label: 'Account history', detail: `Active for ${Math.floor(ageDays)} days.` }
        : {
            id: 'history',
            status: 'warn',
            label: 'Account history',
            detail: `The account was created ${Math.max(0, Math.floor(ageDays))} day(s) ago.`,
            suggestion: 'New accounts are fine, but double-check the address is yours before claiming a large amount.',
          },
    );
  }
  return checks;
}

function horizonUrl(): string {
  return getNetwork() === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
}

/** Fetches the account and its first operation from Horizon and evaluates them. */
export async function verifyBeneficiaryAccount(
  address: string,
  amountUsdc: number,
  options: { usdcIssuer?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<VerificationCheck[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = horizonUrl();
  const accountRes = await fetchImpl(`${base}/accounts/${address}`, { signal: options.signal });
  if (accountRes.status === 404) {
    return evaluateBeneficiaryAccount(null, { amountUsdc, firstActivityAt: null });
  }
  if (!accountRes.ok) throw new Error(`Horizon returned HTTP ${accountRes.status}`);
  const account = (await accountRes.json()) as HorizonAccountSummary;

  let firstActivityAt: Date | null = null;
  try {
    const opsRes = await fetchImpl(`${base}/accounts/${address}/operations?order=asc&limit=1`, {
      signal: options.signal,
    });
    if (opsRes.ok) {
      const ops = (await opsRes.json()) as { _embedded?: { records?: { created_at?: string }[] } };
      const createdAt = ops._embedded?.records?.[0]?.created_at;
      if (createdAt) firstActivityAt = new Date(createdAt);
    }
  } catch {
    // History is advisory; the other checks still apply.
  }

  return evaluateBeneficiaryAccount(account, {
    amountUsdc,
    usdcIssuer: options.usdcIssuer,
    firstActivityAt,
  });
}
