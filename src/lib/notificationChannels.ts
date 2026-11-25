/**
 * User-selectable notification channels (#904).
 *
 * A reminder subscription can be delivered over one or more channels. The
 * channel list is the single source of truth for validation (API routes),
 * persistence (reminder store) and delivery (dispatch).
 */

export const NOTIFICATION_CHANNELS = ['email', 'push', 'sms', 'in-app'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Channels enabled when a subscription does not specify any (legacy records). */
export const DEFAULT_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['email'];

export const SMS_MAX_LENGTH = 20;
const SMS_REGEX = /^\+?[0-9][0-9\s-]{5,}$/;

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === 'string' && (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

/** A phone number in E.164-ish form: optional `+`, digits, spaces and dashes. */
export function isValidPhoneNumber(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length <= SMS_MAX_LENGTH && SMS_REGEX.test(trimmed);
}

/**
 * Normalizes a caller-supplied channel list: drops unknown/duplicate entries,
 * keeps the canonical order, and falls back to the defaults when nothing valid
 * is left. Returns `null` when the input is present but not an array, so routes
 * can answer 400 instead of silently ignoring a malformed value.
 */
export function normalizeNotificationChannels(input: unknown): NotificationChannel[] | null {
  if (input === undefined || input === null) return [...DEFAULT_NOTIFICATION_CHANNELS];
  if (!Array.isArray(input)) return null;
  const selected = NOTIFICATION_CHANNELS.filter((channel) => input.includes(channel));
  return selected.length > 0 ? selected : [...DEFAULT_NOTIFICATION_CHANNELS];
}

/** Channels a stored subscription is delivered over, defaulting for legacy records. */
export function getSubscriptionChannels(
  channels: readonly NotificationChannel[] | undefined,
): NotificationChannel[] {
  return channels && channels.length > 0 ? [...channels] : [...DEFAULT_NOTIFICATION_CHANNELS];
}

/**
 * The first problem with a channel selection, or null when it is acceptable.
 * `sms` requires a valid phone number; every other channel needs nothing extra.
 */
export function validateNotificationChannels(
  channels: readonly NotificationChannel[],
  phone?: string,
): string | null {
  if (channels.length === 0) return 'Select at least one notification channel';
  if (channels.includes('sms') && !isValidPhoneNumber(phone ?? '')) {
    return 'A valid phone number is required for SMS notifications';
  }
  return null;
}
