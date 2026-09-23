import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type LinkState = 'checking' | 'valid' | 'invalid';

/** How long to wait for Supabase's PASSWORD_RECOVERY event before treating
 * the link as expired/invalid/already used. The event fires almost
 * immediately once the client parses the token from the URL, this is just
 * a generous margin. */
const LINK_CHECK_TIMEOUT_MS = 4000;

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-reset-password',
  styleUrl: './reset-password.css',
  templateUrl: './reset-password.html',
})
export class ResetPassword implements OnDestroy {
  linkState = signal<LinkState>('checking');

  newPassword = signal('');
  confirmPassword = signal('');
  submitting = signal(false);
  success = signal(false);
  error = signal('');

  private subscription: { unsubscribe: () => void };
  private timeoutHandle: ReturnType<typeof setTimeout>;

  constructor(private authService: AuthService) {
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
      this.success.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not update your password. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
