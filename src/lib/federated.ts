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
 * Resolves a Stellar federated address (e.g., "user*example.com") to a Stellar account ID.
 *
 * For non-federated addresses (those not containing a `*`), returns the input unchanged.
 *
 * For federated addresses:
 * 1. Fetches the stellar.toml file from the specified domain's `.well-known/` directory
 * 2. Extracts the FEDERATION_SERVER URL from the TOML
 * 3. Queries the federation server with the federated address to obtain the account ID
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
 *   - The stellar.toml file cannot be fetched from the domain
 *   - The FEDERATION_SERVER entry is missing from the TOML
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

  const [name, domain] = address.split('*');

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

    const federationServerLine = stellarToml
      .split('\n')
      .find((line) => line.startsWith('FEDERATION_SERVER'));

    if (!federationServerLine) {
      throw new Error(`No FEDERATION_SERVER found in ${domain}/.well-known/stellar.toml`);
    }

    const federationUrl = federationServerLine.split('=')[1]?.trim().replace(/["']/g, '');

    if (!federationUrl) {
      throw new Error('Invalid FEDERATION_SERVER URL');
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

export function isFederatedAddress(address: string): boolean {
  return address.includes('*');
}
