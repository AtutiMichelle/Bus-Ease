import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';

type LinkState = 'checking' | 'valid' | 'invalid';

/** How long to wait for Supabase's PASSWORD_RECOVERY event before treating
 * the link as expired/invalid/already used. The event fires almost
 * immediately once the client parses the token from the URL, this is just
 * a generous margin. */
const LINK_CHECK_TIMEOUT_MS = 4000;

@Component({
  imports: [FormsModule],
  selector: 'app-reset-password',
  styleUrl: './reset-password.css',
  templateUrl: './reset-password.html',
})
export class ResetPassword implements OnDestroy {
  private authService = inject(AuthService);
  private authModal = inject(AuthModalService);
  private router = inject(Router);

  linkState = signal<LinkState>('checking');

  newPassword = signal('');
  confirmPassword = signal('');
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);
  submitting = signal(false);
  success = signal(false);
  error = signal('');

  /** The same rules the sign-up form enforces, listed one by one so each can
   * tick itself off as the user types rather than only failing at the end. */
  passwordRules = computed(() => {
    const password = this.newPassword();
    return [
      { label: 'At least 8 characters', met: password.length >= 8 },
      { label: 'Contains a letter', met: /[a-zA-Z]/.test(password) },
      { label: 'Contains a number', met: /[0-9]/.test(password) },
    ];
  });

  private subscription: { unsubscribe: () => void };
  private timeoutHandle: ReturnType<typeof setTimeout>;

  constructor() {
    const { data } = this.authService.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.linkState.set('valid');
      }
    });
    this.subscription = data.subscription;

    this.timeoutHandle = setTimeout(() => {
      if (this.linkState() === 'checking') {
        this.linkState.set('invalid');
      }
    }, LINK_CHECK_TIMEOUT_MS);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    clearTimeout(this.timeoutHandle);
  }

  get passwordTooWeak(): boolean {
    const password = this.newPassword();
    if (password.length === 0) {
      return false;
    }
    return password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password);
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword().length > 0 && this.newPassword() !== this.confirmPassword();
  }

  get canSubmit(): boolean {
    return (
      this.newPassword().length > 0 &&
      this.confirmPassword().length > 0 &&
      !this.passwordTooWeak &&
      !this.passwordsMismatch &&
      !this.submitting()
    );
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    try {
      await this.authService.updatePassword(this.newPassword());
      // Signed out on purpose: the recovery link's session is only meant to
      // authorise this one change, and logging back in proves the new
      // password works (and clears it from any other device sharing the link).
      await this.authService.signOut().catch((signOutError) =>
        console.warn('Could not sign out after the password change', signOutError),
      );
      this.success.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not update your password. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  /** Both of these send the user home with the modal already on the right
   * view, since login and recovery no longer have pages of their own. */
  requestNewLink(): void {
    this.authModal.open('forgot');
    this.router.navigateByUrl('/');
  }

  goToLogin(): void {
    this.authModal.open('login');
    this.router.navigateByUrl('/');
  }
}
