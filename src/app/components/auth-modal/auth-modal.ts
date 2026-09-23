import { Component, DestroyRef, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, LoginLockedError } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';
import { StaffService } from '../../services/staff.service';

/** How long the resend button stays held after a reset email goes out. */
const RESEND_SECONDS = 60;

@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule],
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

  /** Seconds left on a server-side lockout, ticked down locally. Zero means
   * the form is usable. */
  lockSecondsLeft = signal(0);
  isLocked = computed(() => this.lockSecondsLeft() > 0);
  lockCountdown = computed(() => {
    const left = this.lockSecondsLeft();
    return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  });
  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private lockExpiry = 0;

  forgotEmail = signal('');
  forgotSubmitting = signal(false);
  forgotSent = signal(false);

  /** Seconds before another reset link can be asked for. */
  resendSecondsLeft = signal(0);
  resendCountdown = computed(() => {
    const left = this.resendSecondsLeft();
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  });
  private resendTimer: ReturnType<typeof setInterval> | null = null;

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
    return (
      this.loginEmail().trim().length > 0 &&
      this.loginPassword().trim().length > 0 &&
      !this.loginSubmitting() &&
      !this.isLocked()
    );
  }

  get forgotCanSubmit(): boolean {
    return this.forgotEmail().trim().length > 0 && !this.forgotSubmitting() && this.resendSecondsLeft() === 0;
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
    // A lockout belongs to an email, not to the form, so the stored one is
    // looked up whenever the email changes -- including the empty value the
    // modal opens with, and a value left in place across a page refresh.
    effect(() => {
      const email = this.loginEmail();
      untracked(() => this.syncLockToEmail(email));
    });
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
      this.stopLockTimer();
      this.stopResendTimer();
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

  /** Swaps the modal over to the forgot-password view rather than navigating
   * to a page of its own, so the user keeps whatever page they were on.
   * Carries over an email already typed into the login form. */
  showForgot(): void {
    if (this.loginEmail().trim().length > 0) {
      this.forgotEmail.set(this.loginEmail().trim());
    }
    this.authModal.open('forgot');
  }

  backToLogin(): void {
    this.authModal.open('login');
  }

  /** Sends the reset email. The same neutral confirmation shows whether or
   * not the address has an account, so this can't be used to find out which
   * emails are registered -- which is also why a failure isn't reported. */
  async sendResetLink(): Promise<void> {
    if (!this.forgotCanSubmit) {
      return;
    }
    this.forgotSubmitting.set(true);
    try {
      await this.authService.resetPasswordForEmail(this.forgotEmail().trim());
    } catch (error) {
      console.warn('Could not send the reset email', error);
    } finally {
      this.forgotSubmitting.set(false);
      this.forgotSent.set(true);
      this.startResendCountdown();
    }
  }

  /** Holds the resend button for a minute, so a stuck user can't send
   * themselves (or anyone else) a pile of reset emails. */
  private startResendCountdown(): void {
    this.stopResendTimer();
    this.resendSecondsLeft.set(RESEND_SECONDS);
    this.resendTimer = setInterval(() => {
      this.resendSecondsLeft.update((left) => Math.max(0, left - 1));
      if (this.resendSecondsLeft() === 0) {
        this.stopResendTimer();
      }
    }, 1000);
  }

  private stopResendTimer(): void {
    if (this.resendTimer !== null) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
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
      this.clearStoredLock(this.loginEmail());
      // Learn the staff role before the welcome step, so it can offer the
      // right destination. A failed check just means a normal customer login.
      await this.staff.ensureRole().catch((error) => console.warn('Could not check staff role', error));
      this.showWelcome.set(true);
    } catch (error) {
      if (error instanceof LoginLockedError) {
        this.startLock(error.retryAfter);
      } else {
        this.loginError.set(error instanceof Error ? error.message : 'Could not log in. Please try again.');
      }
    } finally {
      this.loginSubmitting.set(false);
    }
  }

  /** Key the lockout is saved under. Normalized the same way the login
   * function normalizes the email, so both sides agree on which account a
   * lock belongs to. */
  private lockKey(email: string): string {
    return `login_lock:${email.trim().toLowerCase()}`;
  }

  /** Starts a fresh lockout from the server's remaining seconds. The expiry
   * is worked out from the local clock rather than a server timestamp, so a
   * browser whose clock is off still waits the right length of time. */
  private startLock(seconds: number): void {
    const expiry = Date.now() + seconds * 1000;
    this.writeStoredLock(this.loginEmail(), expiry);
    this.runLock(expiry);
  }

  /** Locks the form and counts down to `expiry`. */
  private runLock(expiry: number): void {
    this.stopLockTimer();
    this.lockExpiry = expiry;
    this.loginPassword.set('');
    this.loginError.set('');
    this.tickLock();
    if (this.lockSecondsLeft() > 0) {
      this.lockTimer = setInterval(() => this.tickLock(), 1000);
    }
  }

  private tickLock(): void {
    const left = Math.max(0, Math.ceil((this.lockExpiry - Date.now()) / 1000));
    this.lockSecondsLeft.set(left);
    if (left === 0) {
      this.stopLockTimer();
      this.clearStoredLock(this.loginEmail());
    }
  }

  private stopLockTimer(): void {
    if (this.lockTimer !== null) {
      clearInterval(this.lockTimer);
      this.lockTimer = null;
    }
  }

  /** Drops whatever is on screen and picks up the lock saved for this email,
   * if it hasn't run out yet. Typing a different email therefore clears the
   * countdown without touching the other email's saved lock. */
  private syncLockToEmail(email: string): void {
    this.stopLockTimer();
    this.lockSecondsLeft.set(0);
    const expiry = this.readStoredLock(email);
    if (expiry === null) {
      return;
    }
    if (expiry > Date.now()) {
      this.runLock(expiry);
    } else {
      this.clearStoredLock(email);
    }
  }

  // Storage can be unavailable (private mode, blocked cookies), and that
  // should only cost the countdown its memory across refreshes, never stop
  // the form working -- the server-side lockout is the real gate either way.
  private readStoredLock(email: string): number | null {
    try {
      const stored = Number(localStorage.getItem(this.lockKey(email)));
      return Number.isFinite(stored) && stored > 0 ? stored : null;
    } catch {
      return null;
    }
  }

  private writeStoredLock(email: string, expiry: number): void {
    try {
      localStorage.setItem(this.lockKey(email), String(expiry));
    } catch {
      // Nothing to do: the countdown still runs for this page view.
    }
  }

  private clearStoredLock(email: string): void {
    try {
      localStorage.removeItem(this.lockKey(email));
    } catch {
      // Nothing to do.
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
