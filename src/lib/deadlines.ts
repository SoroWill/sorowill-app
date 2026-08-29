import { type Will } from '@sorowill/sdk';
import { isWillNotFoundMessage } from '@/lib/errors';

export function nextCheckinDeadline(will: Will): Date {
  return new Date(will.lastCheckin.getTime() + will.checkinPeriodDays * 86_400 * 1000);
}

export function graceDeadline(will: Will): Date | null {
  if (!will.triggerTime) {
    return null;
  }
  return new Date(will.triggerTime.getTime() + will.gracePeriodDays * 86_400 * 1000);
}

export enum WillErrorCode {
  NotFound = 'NOT_FOUND',
  Network = 'NETWORK_ERROR',
  Unknown = 'UNKNOWN',
}

export function categorizeWillError(err: unknown): WillErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  if (isWillNotFoundMessage(message)) {
    return WillErrorCode.NotFound;
  }

  if (
    normalized.includes('network') ||
    normalized.includes('timeout') ||
    normalized.includes('fetch') ||
    normalized.includes('simulation failed')
  ) {
    return WillErrorCode.Network;
  }

  return WillErrorCode.Unknown;
}

export function getWillErrorMessage(err: unknown): string {
  const code = categorizeWillError(err);

  switch (code) {
    case WillErrorCode.NotFound:
      return 'This will could not be found. Please check the link and try again.';
    case WillErrorCode.Network:
      return 'Unable to reach the network. Please check your connection and retry.';
    default:
      return err instanceof Error ? err.message : 'Failed to load will';
  }
}

function splitDuration(totalSeconds: number) {
  const clamped = Math.max(totalSeconds, 0);
  const days = Math.floor(clamped / 86_400);
  const hours = Math.floor((clamped % 86_400) / 3_600);
  const minutes = Math.floor((clamped % 3_600) / 60);
  const seconds = Math.floor(clamped % 60);
  return { days, hours, minutes, seconds };
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatCheckinCountdown(secondsLeft: number, overdueLabel = false): string {
  if (overdueLabel && secondsLeft <= 0) {
    return 'Overdue — 00:00:00:00';
  }
  const { days, hours, minutes, seconds } = splitDuration(secondsLeft);
  return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatCheckinLabel(secondsLeft: number): string {
  if (secondsLeft <= 0) {
    return 'Check-in overdue';
  }

  if (secondsLeft < 86_400) {
    const { hours, minutes } = splitDuration(secondsLeft);
    if (hours > 0) {
      return `Check-in due in ${hours}h ${minutes}m`;
    }
    return `Check-in due in ${minutes}m`;
  }

  const daysLeft = Math.ceil(secondsLeft / 86_400);
  return `Check-in due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}
