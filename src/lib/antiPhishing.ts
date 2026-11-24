/**
 * Anti-phishing helpers (#909): canonical domain verification, suspicious-host detection and
 * safe external link checking. Pure functions so they can run on the server and in the browser.
 */

/** Canonical production origin. Overridable for previews via NEXT_PUBLIC_APP_URL. */
export const CANONICAL_ORIGIN = 'https://sorowill.org';

/** Hosts that are always trusted, even when the app is served from a preview URL. */
export const TRUSTED_HOSTS = ['sorowill.org', 'www.sorowill.org', 'localhost', '127.0.0.1'];

/** Brand tokens used to spot look-alike domains (e.g. `sorowill-app.xyz`). */
const BRAND_TOKENS = ['sorowill', 'soro-will', 'sorow1ll'];

/** TLDs frequently used for throwaway phishing domains. */
const SUSPICIOUS_TLDS = ['zip', 'mov', 'top', 'xyz', 'click', 'link', 'gq', 'tk', 'ml', 'cf', 'work'];

/** URL shorteners hide the real destination, so they are never treated as safe. */
const SHORTENER_HOSTS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'cutt.ly'];

export type DomainStatus = 'verified' | 'unverified' | 'suspicious';

export interface DomainVerification {
  status: DomainStatus;
  host: string;
  /** Human-readable reason, suitable for a warning banner. */
  reason: string;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/** Returns the hostname of a URL string, or null when it cannot be parsed. */
export function hostOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return null;
  }
}

/** True when `host` is the canonical domain or one of its subdomains. */
export function isTrustedHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return TRUSTED_HOSTS.some(
    (trusted) => normalized === trusted || normalized.endsWith(`.${trusted}`),
  );
}

/** Heuristics for look-alike / throwaway hosts. */
export function isSuspiciousHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (!normalized || isTrustedHost(normalized)) return false;
  if (normalized.includes('xn--')) return true; // punycode homograph
  if (normalized.split('.').length > 4) return true; // deep subdomain nesting
  if (normalized.includes('@')) return true;
  const tld = normalized.split('.').pop() ?? '';
  if (SUSPICIOUS_TLDS.includes(tld)) return true;
  return BRAND_TOKENS.some((token) => normalized.includes(token));
}

/**
 * Verifies the domain the app is currently served from. `origin` defaults to the browser
 * location; pass it explicitly on the server.
 */
export function verifyDomain(origin?: string | null): DomainVerification {
  const resolved =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : CANONICAL_ORIGIN);
  const host = hostOf(resolved) ?? '';
  if (!host) {
    return { status: 'suspicious', host: '', reason: 'The site address could not be verified.' };
  }
  if (isTrustedHost(host)) {
    return { status: 'verified', host, reason: 'You are on the official SoroWill domain.' };
  }
  if (isSuspiciousHost(host)) {
    return {
      status: 'suspicious',
      host,
      reason: 'This address looks like a SoroWill look-alike. Do not enter your secret key.',
    };
  }
  return {
    status: 'unverified',
    host,
    reason: 'This domain is not the official SoroWill domain. Verify the address before signing.',
  };
}

export type LinkSafety = 'safe' | 'external' | 'unsafe';

export interface LinkCheck {
  safety: LinkSafety;
  url: string | null;
  reason: string;
}

/**
 * Checks a link before it is rendered or followed. Only https URLs on trusted hosts are `safe`;
 * other https URLs are `external` (open with rel="noopener noreferrer"); everything else is
 * `unsafe` and must not be linked.
 */
export function checkLink(value: string | undefined | null): LinkCheck {
  if (!value || !value.trim()) {
    return { safety: 'unsafe', url: null, reason: 'Empty link.' };
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { safety: 'unsafe', url: null, reason: 'Malformed link.' };
  }
  if (url.protocol !== 'https:') {
    return { safety: 'unsafe', url: null, reason: 'Only https links are allowed.' };
  }
  const host = normalizeHost(url.hostname);
  if (SHORTENER_HOSTS.includes(host)) {
    return { safety: 'unsafe', url: null, reason: 'Shortened links hide their destination.' };
  }
  if (isSuspiciousHost(host)) {
    return { safety: 'unsafe', url: null, reason: 'Link points to a suspicious domain.' };
  }
  if (isTrustedHost(host)) {
    return { safety: 'safe', url: url.toString(), reason: 'Official SoroWill link.' };
  }
  return { safety: 'external', url: url.toString(), reason: 'External link — verify the address.' };
}

/** True when a link may be rendered as an anchor. */
export function isSafeLink(value: string | undefined | null): boolean {
  return checkLink(value).safety !== 'unsafe';
}
