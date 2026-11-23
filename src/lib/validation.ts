import { normalizeWalletNetwork } from "@/lib/freighter";

/**
 * The networks SoroWill supports. Kept as a string union so callers can pass
 * either the app's configured network or a raw wallet network value.
 */
export type SoroWillNetwork = "PUBLIC" | "TESTNET" | "FUTURENET" | "STANDALONE";

export interface NetworkMismatchResult {
  mismatched: boolean;
  connectedNetwork: string | null;
  expectedNetwork: SoroWillNetwork;
}

/**
 * Normalizes an arbitrary wallet network value into a canonical network name.
 * Returns null when the value cannot be resolved to a known network.
 */
function normalizeToKnownNetwork(
  network: string | null | undefined
): SoroWillNetwork | null {
  if (!network) {
    return null;
  }

  const normalized = normalizeWalletNetwork(network);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  switch (upper) {
    case "PUBLIC":
    case "MAINNET":
    case "PUBLIC_NETWORK":
      return "PUBLIC";
    case "TESTNET":
    case "TEST_NETWORK":
      return "TESTNET";
    case "FUTURENET":
    case "FUTURE_NETWORK":
      return "FUTURENET";
    case "STANDALONE":
    case "STANDALONE_NETWORK":
      return "STANDALONE";
    default:
      return null;
  }
}

/**
 * Determines whether the connected wallet network matches the expected app
 * network. A mismatch is reported when no wallet network is available or when
 * the wallet network differs from the expected network.
 */
export function getNetworkMismatch(
  connectedNetwork: string | null | undefined,
  expectedNetwork: SoroWillNetwork
): NetworkMismatchResult {
  const normalizedConnected = normalizeToKnownNetwork(connectedNetwork);
  const normalizedExpected = normalizeToKnownNetwork(expectedNetwork) ?? expectedNetwork;

  const mismatched =
    normalizedConnected === null || normalizedConnected !== normalizedExpected;

  return {
    mismatched,
    connectedNetwork: normalizedConnected,
    expectedNetwork: normalizedExpected,
  };
}

/**
 * Convenience predicate so submit buttons can gate on network mismatch.
 */
export function isTransactionBlockedByNetworkMismatch(
  connectedNetwork: string | null | undefined,
  expectedNetwork: SoroWillNetwork
): boolean {
  return getNetworkMismatch(connectedNetwork, expectedNetwork).mismatched;
}

/**
 * Returns a clear, user-facing message describing the network mismatch and
 * suggesting the user switch their Freighter wallet to the expected network.
 */
export function getNetworkMismatchMessage(
  connectedNetwork: string | null | undefined,
  expectedNetwork: SoroWillNetwork
): string {
  const { mismatched, connectedNetwork: normalizedConnected, expectedNetwork: normalizedExpected } =
    getNetworkMismatch(connectedNetwork, expectedNetwork);

  if (!mismatched) {
    return "";
  }

  if (!normalizedConnected) {
    return `We couldn't detect your Freighter wallet network. Please connect your wallet and switch it to the ${normalizedExpected} network to continue.`;
  }

  return `Your Freighter wallet is connected to the ${normalizedConnected} network, but SoroWill requires the ${normalizedExpected} network. Please switch your Freighter wallet to the ${normalizedExpected} network to continue.`;
}
```

```typescript
// src/lib/validation.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  getNetworkMismatch,
  isTransactionBlockedByNetworkMismatch,
  getNetworkMismatchMessage,
} from "@/lib/validation";

vi.mock("@/lib/freighter", () => ({
  normalizeWalletNetwork: (network: string | null | undefined) => {
    if (!network) return null;
    return network;
  },
}));

describe("getNetworkMismatch", () => {
  it("reports no mismatch when networks match", () => {
    const result = getNetworkMismatch("TESTNET", "TESTNET");
    expect(result.mismatched).toBe(false);
    expect(result.connectedNetwork).toBe("TESTNET");
    expect(result.expectedNetwork).toBe("TESTNET");
  });

  it("normalizes aliases before comparing", () => {
    const result = getNetworkMismatch("MAINNET", "PUBLIC");
    expect(result.mismatched).toBe(false);
    expect(result.connectedNetwork).toBe("PUBLIC");
  });

  it("reports a mismatch when networks differ", () => {
    const result = getNetworkMismatch("PUBLIC", "TESTNET");
    expect(result.mismatched).toBe(true);
    expect(result.connectedNetwork).toBe("PUBLIC");
    expect(result.expectedNetwork).toBe("TESTNET");
  });

  it("reports a mismatch when the wallet network is null", () => {
    const result = getNetworkMismatch(null, "TESTNET");
    expect(result.mismatched).toBe(true);
    expect(result.connectedNetwork).toBeNull();
  });

  it("reports a mismatch when the wallet network is undefined", () => {
    const result = getNetworkMismatch(undefined, "TESTNET");
    expect(result.mismatched).toBe(true);
    expect(result.connectedNetwork).toBeNull();
  });

  it("reports a mismatch when the wallet network is unknown", () => {
    const result = getNetworkMismatch("SOMETHING_ELSE", "TESTNET");
    expect(result.mismatched).toBe(true);
    expect(result.connectedNetwork).toBeNull();
  });
});

describe("isTransactionBlockedByNetworkMismatch", () => {
  it("returns false when networks match", () => {
    expect(isTransactionBlockedByNetworkMismatch("TESTNET", "TESTNET")).toBe(false);
  });

  it("returns true when networks differ", () => {
    expect(isTransactionBlockedByNetworkMismatch("PUBLIC", "TESTNET")).toBe(true);
  });

  it("returns true when the wallet network is missing", () => {
    expect(isTransactionBlockedByNetworkMismatch(null, "TESTNET")).toBe(true);
    expect(isTransactionBlockedByNetworkMismatch(undefined, "TESTNET")).toBe(true);
  });
});

describe("getNetworkMismatchMessage", () => {
  it("returns an empty string when networks match", () => {
    expect(getNetworkMismatchMessage("TESTNET", "TESTNET")).toBe("");
  });

  it("suggests switching networks when mismatched", () => {
    const message = getNetworkMismatchMessage("PUBLIC", "TESTNET");
    expect(message).toContain("PUBLIC");
    expect(message).toContain("TESTNET");
    expect(message.toLowerCase()).toContain("switch");
  });

  it("asks the user to connect when no network is detected", () => {
    const message = getNetworkMismatchMessage(null, "TESTNET");
    expect(message.toLowerCase()).toContain("connect");
    expect(message).toContain("TESTNET");
  });
});