const MS_PER_DAY = 86_400 * 1000;

/** Within this many days of the deadline the check-in is flagged as due soon. */
export const CHECKIN_DUE_SOON_DAYS = 3;

export type CheckinTone = 'ok' | 'soon' | 'overdue';

export interface CheckinStatus {
  /** Whole days since the last check-in (never negative). */
  daysSince: number;
  /** When the next check-in is due: last check-in plus the check-in period, in UTC epoch time. */
  nextDeadline: Date;
  overdue: boolean;
  /** `overdue` once the deadline has passed, `soon` inside the last days, otherwise `ok`. */
  tone: CheckinTone;
}

/** Summarises a will's check-in state for display (#826). */
export function getCheckinStatus(lastCheckin: Date, checkinPeriodDays: number, now: Date = new Date()): CheckinStatus {
  const nextDeadline = new Date(lastCheckin.getTime() + checkinPeriodDays * MS_PER_DAY);
  const msLeft = nextDeadline.getTime() - now.getTime();
  const overdue = msLeft <= 0;
  const tone: CheckinTone = overdue ? 'overdue' : msLeft < CHECKIN_DUE_SOON_DAYS * MS_PER_DAY ? 'soon' : 'ok';
  return {
    daysSince: Math.max(0, Math.floor((now.getTime() - lastCheckin.getTime()) / MS_PER_DAY)),
    nextDeadline,
    overdue,
    tone,
  };
}
