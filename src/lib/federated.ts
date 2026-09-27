const STELLAR_TOML_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory cache of fetched stellar.toml contents, keyed by domain.
 * Each entry includes the TOML content and an expiry timestamp.
 * Cache TTL is 5 minutes per domain.
 *
 * @see {@link resolveFederatedAddress} - This cache is used to avoid
 * repeatedly fetching the same stellar.toml file during the process lifetime.
 */
const STELLAR_TOML_CACHE = new Map<string, { toml: string; expiresAt: number }>();
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Strict hostname validator for the domain portion of a federated address.
 *
 * Rejects anything that contains characters that could alter the URL target:
 *   - `@`  — would introduce userinfo credentials
 *   - `/`  — would add a path component
 *   - `?`  — would add a query string
 *   - `#`  — would add a fragment
 *   - ` `  — whitespace is never valid in a hostname
 *
 * Accepts labels (a-z, A-Z, 0-9, `-`) separated by dots, optionally with a
 * port suffix (`hostname:port`). The port, if present, must be all digits.
 *
 * This deliberately does not follow the full IDNA/Punycode spec — federation
 * addresses in practice use plain ASCII hostnames.
 *
 * (#339)
 */
const STRICT_HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*(?::\d+)?$/;

/**
 * Resolves a Stellar federated address (e.g., "user*example.com") to a Stellar account ID.
 *
 * For non-federated addresses (those not containing a `*`), returns the input unchanged.
 *
 * For federated addresses:
 * 1. Validates that the address has exactly one `*` with a non-empty name on the left
 *    and a strictly-validated hostname (no `@`, `/`, `?`, `#`, or whitespace) on the right (#339)
 * 2. Fetches the stellar.toml file from the specified domain's `.well-known/` directory
 * 3. Extracts the FEDERATION_SERVER URL from the TOML using exact-key matching that
 *    handles surrounding whitespace and preserves `=` characters inside the value (#340)
 * 4. Rejects non-`https` federation server URLs (#340)
 * 5. Queries the federation server with the federated address to obtain the account ID
 *
 * **Caching Behavior:**
 * - stellar.toml files are cached per-domain for 5 minutes to avoid repeated network requests
 * - Repeated calls for the same domain within the cache window will reuse the cached TOML
 * - Cache entries are stored for the duration of the process and automatically expire after 5 minutes
 *
 * @param address - A Stellar address, either a public key (e.g., "GXXXXXX...") or
 *                  a federated address (e.g., "username*example.com")
 * @returns The Stellar account ID (public key) if the address is federated, or the input unchanged if it's already a public key
 * @throws {Error} If the address is federated but:
 *   - The address does not have exactly one `*` (#339)
 *   - The name or domain portion is empty (#339)
 *   - The domain fails strict hostname validation (contains `@`, `/`, `?`, `#`, or whitespace) (#339)
 *   - The stellar.toml file cannot be fetched from the domain
 *   - The FEDERATION_SERVER entry is missing from the TOML (#340)
 *   - The FEDERATION_SERVER URL is not https (#340)
 *   - The federation server cannot resolve the federated address
 *   - The federation server returns a malformed account ID
 *
 * @example
 * // Federated address - will fetch and resolve
 * const accountId = await resolveFederatedAddress("user*example.com");
 * // Returns: "GXXXXXX..." (the resolved account ID)
 *
 * @example
 * // Regular public key - returned unchanged
 * const accountId = await resolveFederatedAddress("GXXXXXX...");
 * // Returns: "GXXXXXX..." (same as input)
 */
export async function resolveFederatedAddress(address: string): Promise<string> {
  if (!address.includes('*')) {
    return address;
  }

  // #339 — Validate that the address contains exactly one `*` and that both
  // the name and domain portions are non-empty.
  const starCount = (address.match(/\*/g) ?? []).length;
  if (starCount !== 1) {
    throw new Error(
      `Invalid federated address "${address}": must contain exactly one "*" separator`,
    );
  }

  const starIndex = address.indexOf('*');
  const name = address.slice(0, starIndex);
  const domain = address.slice(starIndex + 1);

  if (!name) {
    throw new Error(
      `Invalid federated address "${address}": the name portion before "*" must not be empty`,
    );
  }

  if (!domain) {
    throw new Error(
      `Invalid federated address "${address}": the domain portion after "*" must not be empty`,
    );
  }

  // #339 — Reject domains that contain characters which would alter the
  // constructed stellar.toml URL target (userinfo, path, query, fragment).
  if (!STRICT_HOSTNAME_REGEX.test(domain)) {
    throw new Error(
      `Invalid federated address "${address}": domain "${domain}" is not a valid hostname` +
        ' (must not contain "@", "/", "?", "#", or whitespace)',
    );
  }

  try {
    const cached = STELLAR_TOML_CACHE.get(domain);
    let stellarToml = cached && cached.expiresAt > Date.now() ? cached.toml : undefined;

    if (!stellarToml) {
      const tomlResponse = await fetch(`https://${domain}/.well-known/stellar.toml`);
      if (!tomlResponse.ok) {
        throw new Error(`Failed to fetch stellar.toml from ${domain}`);
      }
      stellarToml = await tomlResponse.text();
      STELLAR_TOML_CACHE.set(domain, {
        toml: stellarToml,
        expiresAt: Date.now() + STELLAR_TOML_CACHE_TTL_MS,
      });
    }

    // #340 — Match the exact key `FEDERATION_SERVER` (trimmed, to tolerate
    // leading whitespace in the TOML file) and read *everything after the
    // first `=`* so that URLs containing `=` (e.g. query strings) are
    // preserved intact.  Only surrounding quotes are stripped — internal
    // quotes inside the value are untouched.
    const federationServerLine = stellarToml
      .split('\n')
      .find((line) => line.trimStart().startsWith('FEDERATION_SERVER') &&
        // Require the key to be exactly `FEDERATION_SERVER` followed by
        // optional whitespace and `=`, preventing `FEDERATION_SERVER_URL`
        // or similar prefixes from matching.
        /^\s*FEDERATION_SERVER\s*=/.test(line));

    if (!federationServerLine) {
      throw new Error(`No FEDERATION_SERVER found in ${domain}/.well-known/stellar.toml`);
    }

    // Take everything after the first `=` so embedded `=` characters in
    // the URL (e.g. base64 query params) are preserved.
    const rawFederationUrl = federationServerLine.slice(federationServerLine.indexOf('=') + 1).trim();

    // Strip only leading/trailing quotes — do not use a global replace that
    // would also remove quotes inside the value.
    const federationUrl = rawFederationUrl.replace(/^["']|["']$/g, '');

    if (!federationUrl) {
      throw new Error('Invalid FEDERATION_SERVER URL');
    }

    // #340 — Reject non-https federation URLs to prevent MITM attacks and
    // to align with the Stellar federation specification which mandates TLS.
    if (!federationUrl.startsWith('https://')) {
      throw new Error(
        `FEDERATION_SERVER URL must use HTTPS, got: "${federationUrl}"`,
      );
    }

    const params = new URLSearchParams({
      q: `${name}*${domain}`,
      type: 'name',
    });

    const response = await fetch(`${federationUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`Federation server returned status ${response.status}`);
    }

    const data = (await response.json()) as { account_id?: string };

    if (!data.account_id) {
      throw new Error('No account_id in federation response');
    }

    if (!STELLAR_PUBLIC_KEY_REGEX.test(data.account_id)) {
      throw new Error('Federation server returned a malformed account_id');
    }

    return data.account_id;
  } catch (error) {
    throw new Error(
      `Failed to resolve federated address "${address}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Returns true if the address is a federated Stellar address (contains '*').
 */
export function isFederatedAddress(address: string): boolean {
  return typeof address === 'string' && address.includes('*');
}
