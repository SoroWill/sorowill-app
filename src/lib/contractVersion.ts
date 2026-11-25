/**
 * Smart contract version migration helpers (#906).
 *
 * The deployed contract exposes a `version()` entry point. This module keeps
 * the version the UI was built against, compares it with what is on chain,
 * and persists the version a user last migrated to so the upgrade banner can
 * be dismissed and a rollback can be offered.
 */

/** Contract version this build of the app was written against. */
export const APP_CONTRACT_VERSION = 2;

/** localStorage key holding the version the user last migrated to. */
export const MIGRATED_VERSION_KEY = 'sorowill:contract-version';

export interface ContractRelease {
  version: number;
  /** Short human-readable title of the release. */
  title: string;
  /** What changed in this release, one bullet per entry. */
  changes: string[];
}

/**
 * Known contract releases, newest last. Used to explain what an upgrade
 * changes and to describe the version a rollback would return to.
 */
export const CONTRACT_RELEASES: readonly ContractRelease[] = [
  {
    version: 1,
    title: 'Initial release',
    changes: ['Will creation, check-ins and guardian release.'],
  },
  {
    version: 2,
    title: 'Guardian voting and top-ups',
    changes: [
      'Guardians can vote to trigger a will instead of a single guardian acting alone.',
      'Owners can top up a will balance without recreating it.',
      'Emergency check-in during the grace period.',
    ],
  },
];

export type UpgradeStatus = 'up-to-date' | 'upgrade-available' | 'rollback-available';

export interface VersionComparison {
  status: UpgradeStatus;
  /** Version currently deployed on chain. */
  deployed: number;
  /** Version the user last migrated to (defaults to the app version). */
  current: number;
  /** Release notes for the versions between `current` and `deployed`. */
  changes: string[];
  /** Release the user would return to with a rollback, if any. */
  rollbackTo: ContractRelease | null;
}

function releaseFor(version: number): ContractRelease | undefined {
  return CONTRACT_RELEASES.find((release) => release.version === version);
}

/** Release notes for every version in `(from, to]`, oldest first. */
export function changesBetween(from: number, to: number): string[] {
  return CONTRACT_RELEASES.filter((release) => release.version > from && release.version <= to).flatMap(
    (release) => release.changes,
  );
}

/**
 * Compares the on-chain contract version with the version the user last
 * migrated to. A deployed version newer than the user's is an upgrade; an
 * older one means the user migrated forward and can roll back.
 */
export function compareContractVersions(deployed: number, current: number = APP_CONTRACT_VERSION): VersionComparison {
  if (deployed > current) {
    return {
      status: 'upgrade-available',
      deployed,
      current,
      changes: changesBetween(current, deployed),
      rollbackTo: null,
    };
  }

  if (deployed < current) {
    return {
      status: 'rollback-available',
      deployed,
      current,
      changes: [],
      rollbackTo: releaseFor(deployed) ?? null,
    };
  }

  return { status: 'up-to-date', deployed, current, changes: [], rollbackTo: null };
}

/** Reads the version the user last migrated to, falling back to the app version. */
export function loadMigratedVersion(): number {
  if (typeof window === 'undefined') return APP_CONTRACT_VERSION;
  const stored = window.localStorage.getItem(MIGRATED_VERSION_KEY);
  const parsed = stored === null ? NaN : Number(stored);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : APP_CONTRACT_VERSION;
}

/** Persists the version the user migrated to (or rolled back to). */
export function saveMigratedVersion(version: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MIGRATED_VERSION_KEY, String(version));
}

/** Clears the stored migration so the app version is used again. */
export function clearMigratedVersion(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MIGRATED_VERSION_KEY);
}
