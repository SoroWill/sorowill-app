import { WillStatus, type Will } from '@sorowill/sdk';

import { graceDeadline, nextCheckinDeadline, parseCreatedAt } from '@/lib/deadlines';
import { getCheckinStatus } from '@/lib/checkinStatus';
import { formatTokenBalance, getSafeBalance } from '@/lib/tokenDecimals';

/** A will as returned by the SDK, optionally carrying its creation timestamp. */
export type SnapshotWill = Will & { createdAt?: Date | string | number | null };

export interface WillSnapshot {
  willId: string;
  /** The requested instant, in UTC epoch milliseconds. */
  timestamp: number;
  timestampIso: string;
  /** The instant the snapshot was produced, in UTC epoch milliseconds. */
  generatedAt: number;
  network: string;
  will: {
    id: string;
    owner: string;
    token: string;
    status: WillStatus;
    balance: string;
    balanceFormatted: string;
    beneficiaries: Array<{ address: string; percentage: number }>;
    guardians: string[];
    guardianVotes: number;
    checkinPeriodDays: number;
    gracePeriodDays: number;
    lastCheckin: string | null;
    triggerTime: string | null;
    createdAt: string | null;
  };
  /** Derived state at `timestamp`. */
  state: {
    checkinDeadline: string | null;
    checkinOverdue: boolean;
    daysSinceCheckin: number | null;
    graceDeadline: string | null;
    graceExpired: boolean;
    claimable: boolean;
  };
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Builds a point-in-time snapshot of a will's state (#901).
 *
 * The on-chain record is the latest known state; `timestamp` is the instant the
 * caller wants the derived state (check-in deadline, grace window, claim
 * availability) evaluated at. It must not be in the future — a snapshot of a
 * state that has not happened yet would be misleading — and it must not predate
 * the will's creation when the SDK exposes a creation timestamp.
 */
export function buildWillSnapshot(
  will: SnapshotWill,
  timestamp: number,
  options: { network: string; now?: number },
): WillSnapshot {
  const now = options.now ?? Date.now();
  const at = new Date(timestamp);
  const lastCheckin = will.lastCheckin ? new Date(will.lastCheckin) : null;
  const triggerTime = will.triggerTime ? new Date(will.triggerTime) : null;
  const createdAt = parseCreatedAt(will.createdAt);

  const checkinDeadline = lastCheckin ? nextCheckinDeadline(will) : null;
  const grace = graceDeadline(will);
  const checkin = lastCheckin
    ? getCheckinStatus(lastCheckin, will.checkinPeriodDays, at)
    : null;

  return {
    willId: String(will.id),
    timestamp,
    timestampIso: at.toISOString(),
    generatedAt: now,
    network: options.network,
    will: {
      id: String(will.id),
      owner: will.owner,
      token: will.token,
      status: will.status,
      balance: String(will.balance),
      balanceFormatted: formatTokenBalance(getSafeBalance(will.balance), will.token),
      beneficiaries: (will.beneficiaries ?? []).map((b) => ({
        address: b.address,
        percentage: b.percentage,
      })),
      guardians: [...(will.guardians ?? [])],
      guardianVotes: will.guardianVotes ?? 0,
      checkinPeriodDays: will.checkinPeriodDays,
      gracePeriodDays: will.gracePeriodDays,
      lastCheckin: toIso(lastCheckin),
      triggerTime: toIso(triggerTime),
      createdAt: toIso(createdAt),
    },
    state: {
      checkinDeadline: toIso(checkinDeadline),
      checkinOverdue: checkin?.overdue ?? false,
      daysSinceCheckin: checkin?.daysSince ?? null,
      graceDeadline: toIso(grace),
      graceExpired: grace !== null && at.getTime() >= grace.getTime(),
      claimable:
        will.status === WillStatus.Triggered && grace !== null && at.getTime() >= grace.getTime(),
    },
  };
}

export type TimestampValidation =
  | { ok: true; timestamp: number }
  | { ok: false; message: string };

/**
 * Validates the `timestamp` query parameter: a non-negative integer of epoch
 * milliseconds (or seconds, when the value is small enough to be unambiguous),
 * not in the future, and not before the will was created.
 */
export function validateSnapshotTimestamp(
  raw: string | null,
  options: { now?: number; createdAt?: Date | null } = {},
): TimestampValidation {
  if (raw === null || raw.trim() === '') {
    return { ok: false, message: 'A timestamp query parameter is required.' };
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: 'timestamp must be a non-negative integer.' };
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    return { ok: false, message: 'timestamp is out of range.' };
  }
  // Values below 1e12 are epoch seconds (year 33658 in ms), so treat them as seconds.
  const timestamp = parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  const now = options.now ?? Date.now();
  if (timestamp > now) {
    return { ok: false, message: 'timestamp must not be in the future.' };
  }
  if (options.createdAt && timestamp < options.createdAt.getTime()) {
    return { ok: false, message: 'timestamp must not predate the will creation.' };
  }
  return { ok: true, timestamp };
}
