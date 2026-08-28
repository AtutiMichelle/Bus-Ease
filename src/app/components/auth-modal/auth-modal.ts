import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';

@Component({
  selector: 'app-auth-modal',
  imports: [FormsModule, RouterLink],
  styleUrl: './auth-modal.css',
  templateUrl: './auth-modal.html',
})
export class AuthModal {
  authModal = inject(AuthModalService);
  private authService = inject(AuthService);
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

  get loginCanSubmit(): boolean {
    return this.loginEmail().trim().length > 0 && this.loginPassword().trim().length > 0 && !this.loginSubmitting();
  }

  get signupPasswordsMismatch(): boolean {
    return (
      this.signupConfirmPassword().trim().length > 0 && this.signupPassword() !== this.signupConfirmPassword()
    );
  }

  get signupCanSubmit(): boolean {
    return (
      this.signupFullName().trim().length > 0 &&
      this.signupEmail().trim().length > 0 &&
      this.signupPassword().trim().length > 0 &&
      this.signupConfirmPassword().trim().length > 0 &&
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
    this.authModal.close();
  }

  switchMode(mode: 'login' | 'signup'): void {
    this.needsEmailConfirmation.set(false);
    this.authModal.open(mode);
  }

  async login(): Promise<void> {
    if (!this.loginCanSubmit) {
      return;
    }
    this.loginError.set('');
    this.loginSubmitting.set(true);
    try {
      await this.authService.signIn(this.loginEmail().trim(), this.loginPassword());
      this.finishSuccess();
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
        this.finishSuccess();
      }
    } catch (error) {
      this.signupError.set(error instanceof Error ? error.message : 'Could not create your account. Please try again.');
    } finally {
      this.signupSubmitting.set(false);
    }
  }

  private finishSuccess(): void {
    const returnUrl = this.authModal.returnUrl();
    this.authModal.close();
    if (returnUrl) {
      this.router.navigateByUrl(returnUrl);
    }
  }
}
