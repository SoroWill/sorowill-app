import type { Will } from '@sorowill/sdk';

/**
 * Roles a connected wallet can hold in SoroWill. A single address may hold
 * several roles at once (e.g. owner of one will and guardian of another).
 */
export type Role = 'owner' | 'guardian' | 'beneficiary' | 'admin';

export const ROLES: readonly Role[] = ['owner', 'guardian', 'beneficiary', 'admin'];

/** Permissions granted to each role. */
export type Permission =
  | 'will:create'
  | 'will:check-in'
  | 'will:top-up'
  | 'will:update'
  | 'will:cancel'
  | 'will:vote-release'
  | 'will:view-share'
  | 'will:verify'
  | 'admin:manage';

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ['will:create', 'will:check-in', 'will:top-up', 'will:update', 'will:cancel'],
  guardian: ['will:vote-release'],
  beneficiary: ['will:view-share', 'will:verify'],
  admin: ['admin:manage'],
};

/** Human-readable labels for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  guardian: 'Guardian',
  beneficiary: 'Beneficiary',
  admin: 'Admin',
};

/** Whether `role` is granted `permission`. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether any of `roles` is granted `permission`. */
export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => roleHasPermission(role, permission));
}

/** Every permission granted to `roles`, de-duplicated. */
export function permissionsFor(roles: readonly Role[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return [...granted];
}

/** Addresses listed in `NEXT_PUBLIC_ADMIN_ADDRESSES` (comma-separated). */
export function getAdminAddresses(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '';
  return raw
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

/** Whether `address` is configured as an admin. */
export function isAdminAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return getAdminAddresses().includes(address);
}

/** The roles `address` holds across the given wills. */
export function getRolesForAddress(
  address: string | null | undefined,
  wills: readonly Will[] = [],
): Role[] {
  if (!address) return [];
  const roles = new Set<Role>();
  if (isAdminAddress(address)) roles.add('admin');
  for (const will of wills) {
    if (will.owner === address) roles.add('owner');
    if (will.guardians.includes(address)) roles.add('guardian');
    if (will.beneficiaries.some((beneficiary) => beneficiary.address === address)) {
      roles.add('beneficiary');
    }
  }
  return ROLES.filter((role) => roles.has(role));
}

/** The role `address` holds on a single will, or null when unrelated. */
export function getRoleForWill(will: Will, address: string | null | undefined): Role | null {
  if (!address) return null;
  if (will.owner === address) return 'owner';
  if (will.guardians.includes(address)) return 'guardian';
  if (will.beneficiaries.some((beneficiary) => beneficiary.address === address)) {
    return 'beneficiary';
  }
  return null;
}
