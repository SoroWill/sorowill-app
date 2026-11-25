import { NextResponse, type NextRequest } from 'next/server';

import { normalizeHost, parseDomainList, resolveCanonicalRedirect } from '@/lib/branding';

/**
 * Custom domain enforcement (issue #880).
 *
 * When a deployment sets `BRAND_CANONICAL_HOST`, requests that arrive on one of
 * its aliases (the platform's own domain, `BRAND_DOMAIN_ALIASES`) are moved to
 * the canonical host with a permanent redirect, preserving path and query.
 * SSL is terminated by the hosting platform, so no certificate handling happens
 * here. See `docs/CUSTOM_DOMAIN.md`.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`.
 */

// Read at module scope so the values are inlined for the edge runtime.
const CANONICAL_HOST = process.env.BRAND_CANONICAL_HOST || '';
const ALIASES = parseDomainList(process.env.BRAND_DOMAIN_ALIASES);

export function proxy(request: NextRequest) {
  const { redirect, target } = resolveCanonicalRedirect(request.nextUrl, CANONICAL_HOST, ALIASES);

  if (redirect && target) {
    return NextResponse.redirect(target, 308);
  }

  const response = NextResponse.next();
  // Expose the effective host to server components/logs without trusting client headers.
  response.headers.set('x-sorowill-host', normalizeHost(request.headers.get('host')));
  return response;
}

export const config = {
  // Skip static assets, image optimisation and the favicon; they never need a
  // domain redirect and running the proxy on them wastes work.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|logo.svg).*)'],
};
