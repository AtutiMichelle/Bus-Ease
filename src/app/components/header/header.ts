import { Component, ElementRef, HostListener, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';
import { StaffService } from '../../services/staff.service';

@Component({
  imports: [RouterLink],
  selector: 'app-header',
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  authService = inject(AuthService);
  authModal = inject(AuthModalService);
  staff = inject(StaffService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);

  menuOpen = signal(false);
  userMenuOpen = signal(false);

  constructor() {
    // Find out once per login whether this person is staff, so the menu can
    // offer the dashboard. Customers just get "not staff" back.
    effect(() => {
      if (this.authService.user()) {
        this.staff.ensureRole().catch((error) => console.warn('Could not check staff role', error));
      }
    });
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    this.userMenuOpen.set(false);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.userMenuOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.userMenuOpen.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
    this.closeMenu();
    this.router.navigate(['/']);
  }
}
