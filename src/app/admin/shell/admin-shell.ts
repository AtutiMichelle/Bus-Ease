import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  /** Only routes that actually exist go here; the rest render as static
   * labels (not links) until those pages exist, rather than pointing
   * somewhere that 404s. */
  route: string | null;
  /** Passed to routerLinkActiveOptions so '/admin' (Dashboard) doesn't also
   * read as active on '/admin/bookings' etc. */
  exact?: boolean;
}

const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard', icon: 'fa-grid-2', route: '/admin', exact: true },
  { label: 'Bookings', icon: 'fa-ticket', route: '/admin/bookings' },
  { label: 'Routes & Schedules', icon: 'fa-route', route: null },
  { label: 'Buses & Fleet', icon: 'fa-bus', route: null },
  { label: 'Customers', icon: 'fa-user', route: null },
  { label: 'Customer Care', icon: 'fa-headset', route: null },
  { label: 'Payments & Wallet', icon: 'fa-wallet', route: null },
  { label: 'Reports', icon: 'fa-chart-column', route: null },
];

const NAV_SYSTEM: NavItem[] = [{ label: 'Settings', icon: 'fa-gear', route: null }];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-admin-shell',
  styleUrl: './admin-shell.css',
  templateUrl: './admin-shell.html',
})
export class AdminShell {
  private authService = inject(AuthService);

  readonly navMain = NAV_MAIN;
  readonly navSystem = NAV_SYSTEM;

  adminName = computed(() => this.authService.displayName());
  adminInitials = computed(() => initials(this.adminName()));
  // No role column exists yet (see guards/auth.guard.ts's adminGuard TODO),
  // so this is a fixed label rather than real per-user data.
  readonly adminRole = 'Administrator';

  // Below 900px the sidebar becomes an off-canvas drawer toggled from the
  // top bar, since a fixed sidebar has nowhere to go on a narrow screen.
  sidebarOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
