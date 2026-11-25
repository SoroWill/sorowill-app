/**
 * Beneficiary notification preferences (#886): whether a beneficiary wants
 * to be notified about a will, how often, and through which channels.
 * Stored per wallet and will on this device.
 */
import { isValidEmail } from '@/lib/serverValidation';

export type NotificationFrequency = 'immediate' | 'daily' | 'weekly';

export interface NotificationPrefs {
  /** Opted in to notifications for this will. */
  enabled: boolean;
  frequency: NotificationFrequency;
  channels: { inApp: boolean; email: boolean };
  /** Required when the email channel is on. */
  email: string;
  /** Which events to be told about. */
  events: { statusChange: boolean; checkinMissed: boolean; readyToClaim: boolean };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  frequency: 'immediate',
  channels: { inApp: true, email: false },
  email: '',
  events: { statusChange: true, checkinMissed: true, readyToClaim: true },
};

const FREQUENCIES: readonly NotificationFrequency[] = ['immediate', 'daily', 'weekly'];

const keyFor = (wallet: string, willId: string) => `sorowill:beneficiary-notify:${wallet}:${willId}`;

/** Problems that block saving, or [] when the preferences are valid. */
export function validateNotificationPrefs(prefs: NotificationPrefs): string[] {
  const errors: string[] = [];
  if (!prefs.enabled) return errors;
  if (!FREQUENCIES.includes(prefs.frequency)) errors.push('Choose how often to be notified.');
  if (!prefs.channels.inApp && !prefs.channels.email) errors.push('Choose at least one delivery method.');
  if (prefs.channels.email && !isValidEmail(prefs.email.trim())) errors.push('Enter a valid email address.');
  if (!Object.values(prefs.events).some(Boolean)) errors.push('Choose at least one event to be notified about.');
  return errors;
}

export function loadNotificationPrefs(wallet: string, willId: string): NotificationPrefs {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(keyFor(wallet, willId)) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_NOTIFICATION_PREFS;
    const stored = raw as Partial<NotificationPrefs>;
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...stored,
      channels: { ...DEFAULT_NOTIFICATION_PREFS.channels, ...stored.channels },
      events: { ...DEFAULT_NOTIFICATION_PREFS.events, ...stored.events },
      frequency: FREQUENCIES.includes(stored.frequency as NotificationFrequency)
        ? (stored.frequency as NotificationFrequency)
        : DEFAULT_NOTIFICATION_PREFS.frequency,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

/** Saves valid preferences; returns the validation errors (empty on success). */
export function saveNotificationPrefs(wallet: string, willId: string, prefs: NotificationPrefs): string[] {
  const errors = validateNotificationPrefs(prefs);
  if (errors.length > 0) return errors;
  try {
    window.localStorage.setItem(keyFor(wallet, willId), JSON.stringify({ ...prefs, email: prefs.email.trim() }));
  } catch {
    return ['Your browser blocked saving preferences.'];
  }
  return [];
}
