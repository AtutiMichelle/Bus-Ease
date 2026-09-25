import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StaffService } from '../../services/staff.service';
import { ICONS, NAV_MAIN, NAV_SYSTEM } from '../admin-nav';
import { AdminIcon } from '../icon/admin-icon';

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
  imports: [AdminIcon, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-admin-shell',
  styleUrl: './admin-shell.css',
  templateUrl: './admin-shell.html',
})
export class AdminShell {
  private authService = inject(AuthService);
  private staff = inject(StaffService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);

  // Menu items follow the signed-in staff role (STAFF_ROLES in
  // staff-access.ts). Hiding an item is only a convenience: the database's
  // row level security and admin-only functions are what protect the data.
  readonly icons = ICONS;

  navMain = computed(() => NAV_MAIN.filter((item) => this.staff.sections().includes(item.section)));
  navSystem = computed(() => NAV_SYSTEM.filter((item) => this.staff.sections().includes(item.section)));
  hasNav = computed(() => this.navMain().length + this.navSystem().length > 0);

  adminName = computed(() => this.authService.displayName());
  adminInitials = computed(() => initials(this.adminName()));
  adminEmail = computed(() => this.authService.user()?.email ?? '');
  // Loaded from staff_users by staffGuard before this page renders.
  adminRole = this.staff.roleLabel;

  // Below 900px the sidebar becomes an off-canvas drawer toggled from the
  // top bar, since a fixed sidebar has nowhere to go on a narrow screen.
  sidebarOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  profileMenuOpen = signal(false);

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const identity = this.elementRef.nativeElement.querySelector('.topbar-identity');
    if (this.profileMenuOpen() && !identity?.contains(event.target as Node)) {
      this.closeProfileMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProfileMenu();
  }

  async logout(): Promise<void> {
    this.closeProfileMenu();
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
