import { AdminSection } from './staff-access';

export interface NavItem {
  label: string;
  icon: string;
  /** Which role permission shows this item (see staff-access.ts). */
  section: AdminSection;
  /** Only routes that actually exist go here; the rest render as static
   * labels (not links) until those pages exist, rather than pointing
   * somewhere that 404s. */
  route: string | null;
  /** Passed to routerLinkActiveOptions so '/admin' (Dashboard) doesn't also
   * read as active on '/admin/bookings' etc. */
  exact?: boolean;
}

export const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard', icon: 'fa-table-cells-large', section: 'dashboard', route: '/admin', exact: true },
  { label: 'Bookings', icon: 'fa-ticket', section: 'bookings', route: '/admin/bookings' },
  { label: 'Routes & Schedules', icon: 'fa-route', section: 'routes', route: null },
  { label: 'Buses & Fleet', icon: 'fa-bus', section: 'fleet', route: null },
  { label: 'Customers', icon: 'fa-user', section: 'customers', route: null },
  { label: 'Customer Care', icon: 'fa-headset', section: 'customer-care', route: null },
  { label: 'Payments & Wallet', icon: 'fa-wallet', section: 'payments', route: null },
  { label: 'Reports', icon: 'fa-chart-column', section: 'reports', route: null },
];

export const NAV_SYSTEM: NavItem[] = [{ label: 'Settings', icon: 'fa-gear', section: 'settings', route: null }];

/** First sidebar item with a real page that the given sections allow. */
export function firstOpenableItem(sections: readonly AdminSection[]): NavItem | null {
  return [...NAV_MAIN, ...NAV_SYSTEM].find((item) => item.route !== null && sections.includes(item.section)) ?? null;
}
