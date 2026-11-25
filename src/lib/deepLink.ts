import { isValidWillId } from '@/lib/willId';

/** Canonical web origin used for universal links and the web fallback. */
export const WEB_ORIGIN = 'https://sorowill.vercel.app';

/** Custom URL scheme registered by the SoroWill mobile app. */
export const APP_SCHEME = 'sorowill';

/** iOS universal-link path prefix (served via /.well-known/apple-app-site-association). */
export const UNIVERSAL_LINK_PATH = '/will';

/** Android App Links path prefix (served via /.well-known/assetlinks.json). */
export const ANDROID_APP_LINK_PATH = '/will';

/** Paths that the mobile app can open directly. */
export type DeepLinkTarget = { kind: 'will'; id: string };

/** Builds the canonical web URL for a will. */
export function willWebUrl(id: string): string {
  return `${WEB_ORIGIN}/will/${encodeURIComponent(id)}`;
}

/** Builds the custom-scheme deep link the mobile app registers. */
export function willAppUrl(id: string): string {
  return `${APP_SCHEME}://will/${encodeURIComponent(id)}`;
}

/**
 * Parses a will id out of a web path (`/will/123`), a universal link
 * (`https://sorowill.vercel.app/will/123`) or a custom-scheme link
 * (`sorowill://will/123`). Returns null for anything else.
 */
export function parseDeepLink(input: string): DeepLinkTarget | null {
  if (!input) return null;
  let pathname: string;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
      pathname = new URL(input).pathname;
    } else {
      pathname = input.split(/[?#]/)[0];
    }
  } catch {
    return null;
  }

  const match = pathname.match(/^\/?will\/([^/]+)\/?$/);
  if (!match) return null;

  const id = decodeURIComponent(match[1]);
  return isValidWillId(id) ? { kind: 'will', id } : null;
}

/** True when the current page is a will detail page that the app can open. */
export function currentWillDeepLink(pathname: string | null | undefined): DeepLinkTarget | null {
  if (!pathname) return null;
  return parseDeepLink(pathname);
}
