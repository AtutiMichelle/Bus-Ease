/** Areas of the admin app that a role can be given. One entry per sidebar
 * item; pages that don't exist yet still have a section so roles can be
 * planned ahead. */
export type AdminSection =
  | 'dashboard'
  | 'bookings'
  | 'routes'
  | 'fleet'
  | 'customers'
  | 'customer-care'
  | 'payments'
  | 'reports'
  | 'settings';

const ALL_SECTIONS: readonly AdminSection[] = [
  'dashboard',
  'bookings',
  'routes',
  'fleet',
  'customers',
  'customer-care',
  'payments',
  'reports',
  'settings',
];

export interface StaffRoleAccess {
  /** Shown under the person's name in the header. */
  label: string;
  /** Sidebar items and pages this role may open. */
  sections: readonly AdminSection[];
}

/** What each staff role can see. To add a role, add ONE entry here and allow
 * the role name in the staff_users check constraint (see
 * supabase/sql/2026-09-21-staff-users.sql). A role with no entry sees
 * nothing and gets the "no access" page.
 *
 * This only controls what the app shows. Hiding a menu item or page is a
 * convenience, not protection: row level security and the admin-only
 * database functions are what actually protect the data, and they keep
 * refusing requests even if someone reaches a page they shouldn't. */
export const STAFF_ROLES: Readonly<Record<string, StaffRoleAccess>> = {
  admin: { label: 'Administrator', sections: ALL_SECTIONS },
  customer_care: { label: 'Customer care', sections: ['bookings', 'customers', 'customer-care'] },
};

// Object.hasOwn so odd role text like "constructor" can't match a prototype key.
function accessFor(role: string | null): StaffRoleAccess | null {
  return role !== null && Object.hasOwn(STAFF_ROLES, role) ? STAFF_ROLES[role] : null;
}

export function sectionsForRole(role: string | null): readonly AdminSection[] {
  return accessFor(role)?.sections ?? [];
}

export function canAccess(role: string | null, section: AdminSection): boolean {
  return sectionsForRole(role).includes(section);
}

/** Header label for a role. Roles without an entry get a readable fallback
 * ("field_agent" becomes "Field agent"). */
export function roleLabel(role: string | null): string {
  if (role === null) {
    return '';
  }
  const known = accessFor(role);
  if (known) {
    return known.label;
  }
  const spaced = role.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
