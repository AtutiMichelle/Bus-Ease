import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';
import { StaffService } from '../../services/staff.service';

@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule, RouterLink],
  styleUrl: './auth-modal.css',
  templateUrl: './auth-modal.html',
})
export class AuthModal {
  authModal = inject(AuthModalService);
  private authService = inject(AuthService);
  private staff = inject(StaffService);
  private router = inject(Router);

  mode = this.authModal.mode;

  loginEmail = signal('');
  loginPassword = signal('');
  loginSubmitting = signal(false);
  loginError = signal('');

  signupFullName = signal('');
  signupEmail = signal('');
  signupPassword = signal('');
  signupConfirmPassword = signal('');
  signupSubmitting = signal(false);
  signupError = signal('');
  needsEmailConfirmation = signal(false);

  showWelcome = signal(false);
  displayName = this.authService.displayName;

  /** Set for staff, so the welcome step can send them to their area. */
  staffHome = this.staff.homeLink;

  get loginCanSubmit(): boolean {
    return this.loginEmail().trim().length > 0 && this.loginPassword().trim().length > 0 && !this.loginSubmitting();
  }

  get signupPasswordsMismatch(): boolean {
    return (
      this.signupConfirmPassword().trim().length > 0 && this.signupPassword() !== this.signupConfirmPassword()
    );
  }

  /** Mirrors the strength rule enforced on the account page's change-password
   * form, checked here too so a weak password is caught before signup rather
   * than only at Supabase's own (lower, dashboard-configured) minimum. */
  get signupPasswordTooWeak(): boolean {
    const password = this.signupPassword();
    if (password.length === 0) {
      return false;
    }
    return password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password);
  }

  get signupCanSubmit(): boolean {
    return (
      this.signupFullName().trim().length > 0 &&
      this.signupEmail().trim().length > 0 &&
      this.signupPassword().trim().length > 0 &&
      this.signupConfirmPassword().trim().length > 0 &&
      !this.signupPasswordTooWeak &&
      !this.signupPasswordsMismatch &&
      !this.signupSubmitting()
    );
  }

  constructor() {
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.showWelcome.set(false);
    this.authModal.close();
  }

  switchMode(mode: 'login' | 'signup'): void {
    this.needsEmailConfirmation.set(false);
    this.authModal.open(mode);
  }

  continueAfterWelcome(): void {
    this.showWelcome.set(false);
    // A saved destination (a guarded page, or the page a booking was started
    // on) always wins. With none, staff go to their own area and customers
    // stay where they are.
    const destination = this.authModal.returnUrl() ?? this.staffHome()?.route ?? null;
    this.authModal.close();
    if (destination) {
      this.router.navigateByUrl(destination);
    }
  }

  async login(): Promise<void> {
    if (!this.loginCanSubmit) {
      return;
    }
    this.loginError.set('');
    this.loginSubmitting.set(true);
    try {
      await this.authService.signIn(this.loginEmail().trim(), this.loginPassword());
      // Learn the staff role before the welcome step, so it can offer the
      // right destination. A failed check just means a normal customer login.
      await this.staff.ensureRole().catch((error) => console.warn('Could not check staff role', error));
      this.showWelcome.set(true);
    } catch (error) {
      this.loginError.set(error instanceof Error ? error.message : 'Could not log in. Please try again.');
    } finally {
      this.loginSubmitting.set(false);
    }
  }

  async signup(): Promise<void> {
    if (!this.signupCanSubmit) {
      return;
    }
    this.signupError.set('');
    this.signupSubmitting.set(true);
    try {
      const { needsEmailConfirmation } = await this.authService.signUp(
        this.signupEmail().trim(),
        this.signupPassword(),
        this.signupFullName().trim(),
      );
      if (needsEmailConfirmation) {
        this.needsEmailConfirmation.set(true);
      } else {
        this.showWelcome.set(true);
      }
    } catch (error) {
      this.signupError.set(error instanceof Error ? error.message : 'Could not create your account. Please try again.');
    } finally {
      this.signupSubmitting.set(false);
    }
  }
}
