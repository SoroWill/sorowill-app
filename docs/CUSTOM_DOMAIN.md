# Custom domain and white-label branding

Run the app on an organisation's own domain with its own name and logo
(issue #880).

## Branding

Branding is read from `NEXT_PUBLIC_*` variables so the server and browser see
the same values. Every value has a SoroWill default; invalid values are ignored
rather than crashing the build.

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_BRAND_NAME` | `SoroWill` | Name in the header, footer, metadata and link previews. |
| `NEXT_PUBLIC_BRAND_TAGLINE` | `Trustless on-chain inheritance on Stellar` | Site description and Open Graph/Twitter description. |
| `NEXT_PUBLIC_BRAND_LOGO_URL` | `/logo.svg` | Relative path or absolute `http(s)` URL. |
| `NEXT_PUBLIC_SITE_URL` | `https://sorowill.vercel.app` | Canonical public URL (no trailing slash), used for metadata and the sitemap. |
| `NEXT_PUBLIC_BRAND_PRIMARY_COLOR` | _unset_ | Validated colour value. Parsed and exposed by `getBranding()`; not yet wired into the Tailwind theme. |

`NEXT_PUBLIC_*` values are inlined at build time, so changing branding requires
a rebuild and redeploy. `src/lib/branding.ts` parses them; `metadata` in
`src/app/layout.tsx`, the header/footer in `src/app/layout-client.tsx`, and the
Open Graph tags on `/verify` use the result.

## Canonical domain redirect

`src/proxy.ts` (Next.js 16's renamed `middleware`) permanently redirects
requests from known aliases to the canonical host, preserving path and query.

| Variable | Example | Description |
| --- | --- | --- |
| `BRAND_CANONICAL_HOST` | `wills.example.org` | Host every alias redirects to. Leave unset to disable redirects. |
| `BRAND_DOMAIN_ALIASES` | `sorowill.vercel.app, www.wills.example.org` | Comma- or space-separated hosts that redirect. |

Behaviour:

- No canonical host → no redirects.
- Request already on the canonical host → no redirect.
- Host is not in the alias list → **no redirect**, so preview deployments and
  unknown hosts are never bounced to production.
- `localhost`, `127.0.0.1` and `[::1]` are never redirected.
- The target comes from configuration, never from the request's `Host` header,
  so the proxy is not an open redirect.
- Static assets under `_next/static`, `_next/image` and the icon files skip the
  proxy.

The proxy also sets an `x-sorowill-host` response header with the normalised
incoming host for server-side logs.

## DNS and TLS

TLS is terminated by the hosting platform; the app does not manage
certificates. On Vercel:

1. Add the custom domain to the project (Settings → Domains).
2. Create the DNS records Vercel shows — typically `CNAME www →
   cname.vercel-dns.com` and an `A`/`ALIAS` record for the apex.
3. Wait for Vercel to issue the certificate and mark the domain verified.
4. Set `BRAND_CANONICAL_HOST` to the custom host and `BRAND_DOMAIN_ALIASES` to
   the platform domain and any other hostnames that should redirect.
5. Set `NEXT_PUBLIC_SITE_URL` to the same canonical URL and redeploy.

For another platform, point DNS at that platform's ingress and terminate TLS
there. Nothing in the app automates certificate issuance.

## Limitations

- No automatic certificate provisioning or renewal.
- No per-request tenant resolution: one deployment serves one brand.
- `NEXT_PUBLIC_BRAND_PRIMARY_COLOR` is not applied to the CSS theme yet.
