import { AdminSection } from './staff-access';

/** Inline SVG icons, 24x24, drawn as strokes. Each icon is a list of path
 * data strings so the shell can render them without an icon library. */
export const ICONS = {
  overview: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  bus: [
    'M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M4 11h16',
    'M7 18v2',
    'M17 18v2',
    'M8 15h.01',
    'M16 15h.01',
  ],
  ticket: [
    'M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1z',
    'M14 6v2',
    'M14 11v2',
    'M14 16v2',
  ],
  route: [
    'M4 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M16 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M8 5h6.5a3.5 3.5 0 0 1 0 7h-5a3.5 3.5 0 0 0 0 7H16',
  ],
  customers: [
    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20',
    'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35',
    'M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  ],
  headset: [
    'M4 14v-2a8 8 0 0 1 16 0v2',
    'M4 14h2.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z',
    'M20 14h-2.5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1H18a2 2 0 0 0 2-2z',
  ],
  card: ['M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3 10h18', 'M7 15h3'],
  chart: ['M5 20V11', 'M12 20V4', 'M19 20v-6'],
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
  clock: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8v4l2.5 1.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  settings: ['M4 8h13', 'M14 5l3 3-3 3', 'M20 16H7', 'M10 13l-3 3 3 3'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z', 'M10 20a2 2 0 0 0 4 0'],
  message: ['M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

export interface NavItem {
  label: string;
  /** Path data for the inline SVG icon (see ICONS). */
  icon: readonly string[];
  /** Which role permission shows this item (see staff-access.ts). */
  section: AdminSection;
  /** Only routes that actually exist go here; the rest render as static
   * labels (not links) until those pages exist, rather than pointing
   * somewhere that 404s. */
  route: string | null;
  /** Passed to routerLinkActiveOptions so '/admin' (Overview) doesn't also
   * read as active on '/admin/bookings' etc. */
  exact?: boolean;
}

export const NAV_MAIN: NavItem[] = [
  { label: 'Overview', icon: ICONS.overview, section: 'dashboard', route: '/admin', exact: true },
  { label: 'Trips', icon: ICONS.bus, section: 'fleet', route: '/admin/trips' },
  { label: 'Bookings', icon: ICONS.ticket, section: 'bookings', route: '/admin/bookings' },
  { label: 'Routes', icon: ICONS.route, section: 'routes', route: '/admin/routes' },
  { label: 'Customers', icon: ICONS.customers, section: 'customers', route: '/admin/customers' },
  { label: 'Payments', icon: ICONS.card, section: 'payments', route: null },
  { label: 'Reports', icon: ICONS.chart, section: 'reports', route: null },
  { label: 'Customer Care', icon: ICONS.headset, section: 'customer-care', route: null },
];

/** Pinned to the bottom of the sidebar, apart from the main list. */
export const NAV_SYSTEM: NavItem[] = [{ label: 'Settings', icon: ICONS.settings, section: 'settings', route: null }];

/** First sidebar item with a real page that the given sections allow. */
export function firstOpenableItem(sections: readonly AdminSection[]): NavItem | null {
  return [...NAV_MAIN, ...NAV_SYSTEM].find((item) => item.route !== null && sections.includes(item.section)) ?? null;
}
