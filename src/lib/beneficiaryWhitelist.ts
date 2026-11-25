'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Beneficiary whitelist (#892).
 *
 * When a whitelist is configured, only addresses on it may be added as
 * beneficiaries. The list is stored per browser in localStorage, so it is a
 * guard against typos and copy/paste mistakes rather than an on-chain control.
 */

/** localStorage key holding the whitelist. */
export const BENEFICIARY_WHITELIST_STORAGE_KEY = 'sorowill:beneficiary-whitelist';

/** Fired on `window` after the whitelist changes, so every mounted form re-reads it. */
export const BENEFICIARY_WHITELIST_EVENT = 'sorowill:beneficiary-whitelist-changed';

/** Addresses are compared without case or surrounding spaces. */
export function normalizeWhitelistAddress(address: string): string {
  return address.trim().toUpperCase();
}

/** Drops blanks and duplicates (case-insensitively) while keeping the first spelling. */
export function normalizeWhitelist(addresses: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const address of addresses) {
    const key = normalizeWhitelistAddress(address);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(address.trim());
  }
  return result;
}

/** Parses the stored JSON, ignoring anything that is not a list of strings. */
export function parseWhitelist(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeWhitelist(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return [];
  }
}

/** Reads the whitelist from localStorage; empty when unset or storage is unavailable. */
export function readWhitelist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseWhitelist(window.localStorage.getItem(BENEFICIARY_WHITELIST_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Persists the whitelist and notifies mounted forms. An empty list disables the check. */
export function writeWhitelist(addresses: readonly string[]): string[] {
  const normalized = normalizeWhitelist(addresses);
  if (typeof window === 'undefined') return normalized;
  try {
    if (normalized.length === 0) {
      window.localStorage.removeItem(BENEFICIARY_WHITELIST_STORAGE_KEY);
    } else {
      window.localStorage.setItem(BENEFICIARY_WHITELIST_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // Storage may be unavailable (private mode); the in-memory state still applies.
  }
  window.dispatchEvent(new Event(BENEFICIARY_WHITELIST_EVENT));
  return normalized;
}

/** True when `address` may be used as a beneficiary under `whitelist`. */
export function isWhitelistedAddress(address: string, whitelist: readonly string[]): boolean {
  if (whitelist.length === 0) return true;
  const key = normalizeWhitelistAddress(address);
  return whitelist.some((entry) => normalizeWhitelistAddress(entry) === key);
}

/** Error message for a beneficiary address that is not on a configured whitelist. */
export function getWhitelistError(address: string, whitelist: readonly string[]): string | null {
  if (!address.trim() || isWhitelistedAddress(address, whitelist)) return null;
  return 'This address is not on the beneficiary whitelist. Add it to the whitelist before using it as a beneficiary';
}

/** Live whitelist for a component, kept in sync with edits made elsewhere. */
export function useBeneficiaryWhitelist(): {
  whitelist: string[];
  setWhitelist: (addresses: readonly string[]) => void;
} {
  const [whitelist, setState] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setState(readWhitelist());
    sync();
    window.addEventListener(BENEFICIARY_WHITELIST_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BENEFICIARY_WHITELIST_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setWhitelist = useCallback((addresses: readonly string[]) => {
    setState(writeWhitelist(addresses));
  }, []);

  return { whitelist, setWhitelist };
}
