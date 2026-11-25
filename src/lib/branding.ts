/**
 * White-label branding and custom domain support (issue #880).
 *
 * Organisations can run their own copy of the app on their own domain. Two
 * kinds of configuration are involved:
 *
 *   - Branding, read from `NEXT_PUBLIC_*` variables so both the server and the
 *     browser can use it: brand name, tagline, logo and canonical site URL.
 *     Every value has a SoroWill default, so an unconfigured deployment is
 *     unchanged.
 *   - The canonical domain and the host names that redirect to it, read by
 *     `src/proxy.ts`. The redirect target always comes from configuration,
 *     never from the request's `Host` header, so the proxy cannot be used as an
 *     open redirect.
 *
 * DNS records, TLS certificate handling and deployment steps are documented in
 * `docs/CUSTOM_DOMAIN.md`.
 */

export interface Branding {
  /** Product name shown in the header and metadata. */
  name: string;
  /** Short description used for the site metadata and link previews. */
  tagline: string;
  /** Logo path or absolute URL. */
  logoUrl: string;
  /** Canonical public URL of this deployment (no trailing slash). */
  siteUrl: string;
  /** Optional primary colour, as a CSS colour string. */
  primaryColor?: string;
}

export const DEFAULT_BRANDING: Branding = {
  name: 'SoroWill',
  tagline: 'Trustless on-chain inheritance on Stellar',
  logoUrl: '/logo.svg',
  siteUrl: 'https://sorowill.vercel.app',
};

type Env = Record<string, string | undefined>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validColor(value: string): boolean {
  // Hex, rgb()/hsl() or a named colour; reject anything that could break out of a style value.
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([0-9.,%\s/]+\))$/.test(value);
}

/**
 * Builds the branding for a deployment from environment variables, falling
 * back to SoroWill defaults for missing or invalid values. Invalid values are
 * ignored rather than crashing the build: a typo in a logo URL should not take
 * the site down.
 */
export function parseBranding(env: Env = process.env): Branding {
  const rawSiteUrl = clean(env.NEXT_PUBLIC_SITE_URL);
  const siteUrl = rawSiteUrl && validUrl(rawSiteUrl) ? rawSiteUrl.replace(/\/+$/, '') : DEFAULT_BRANDING.siteUrl;

  const logoUrl = clean(env.NEXT_PUBLIC_BRAND_LOGO_URL) ?? DEFAULT_BRANDING.logoUrl;
  const primaryColor = clean(env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR);

  return {
    name: clean(env.NEXT_PUBLIC_BRAND_NAME) ?? DEFAULT_BRANDING.name,
    tagline: clean(env.NEXT_PUBLIC_BRAND_TAGLINE) ?? DEFAULT_BRANDING.tagline,
    // A relative path keeps working on any custom domain; an absolute URL must be http(s).
    logoUrl: logoUrl.startsWith('/') || validUrl(logoUrl) ? logoUrl : DEFAULT_BRANDING.logoUrl,
    siteUrl,
    ...(primaryColor && validColor(primaryColor) ? { primaryColor } : {}),
  };
}

/** Branding for the current process. */
export function getBranding(): Branding {
  return parseBranding();
}

/** True for a plain DNS hostname (optionally `www.`), with no scheme, port or path. */
export function isValidHostname(value: string): boolean {
  const host = value.trim().toLowerCase();
  if (host.length === 0 || host.length > 253) return false;
  if (host === 'localhost') return true;
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
}

/** Lowercases a host and removes any port (`example.com:3000` → `example.com`). */
export function normalizeHost(value: string | null | undefined): string {
  const host = (value ?? '').trim().toLowerCase();
  if (!host) return '';
  // Bracketed IPv6 hosts keep their brackets so [::1]:3000 normalises to [::1].
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

/** Parses a comma- or space-separated list of domains, dropping invalid entries. */
export function parseDomainList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry !== '' && isValidHostname(entry));
}

export interface CanonicalRedirect {
  /** Whether the request should be redirected. */
  redirect: boolean;
  /** Absolute target URL (with path and query) when `redirect` is true. */
  target?: string;
}

/**
 * Decides whether a request should move to the canonical custom domain.
 *
 * Redirects only when a canonical host is configured, the incoming host is not
 * already canonical, and the host is one of `aliases` (for example the default
 * `*.vercel.app` domain). Unknown hosts are left alone, so a preview deployment
 * or a local dev server never gets bounced to production.
 */
export function resolveCanonicalRedirect(
  requestUrl: URL,
  canonicalHost: string | undefined,
  aliases: readonly string[],
): CanonicalRedirect {
  const canonical = normalizeHost(canonicalHost);
  if (!canonical) return { redirect: false };

  const host = normalizeHost(requestUrl.host);
  if (!host || host === canonical) return { redirect: false };
  // Never redirect a local development server away from itself.
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return { redirect: false };
  }
  if (!aliases.includes(host)) return { redirect: false };

  const protocol = requestUrl.protocol === 'http:' && !canonical.includes('localhost') ? 'https:' : requestUrl.protocol;
  const target = new URL(requestUrl.pathname + requestUrl.search, `${protocol}//${canonical}`);
  return { redirect: true, target: target.toString() };
}
