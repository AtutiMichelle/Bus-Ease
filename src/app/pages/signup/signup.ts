import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-signup',
  styleUrl: './signup.css',
  templateUrl: './signup.html',
})
export class Signup {
  fullName = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  submitting = signal(false);
  errorMessage = signal('');
  needsEmailConfirmation = signal(false);

  get passwordsMismatch(): boolean {
    return (
      this.confirmPassword().trim().length > 0 &&
      this.password() !== this.confirmPassword()
    );
  }

  get canSubmit(): boolean {
    return (
      this.fullName().trim().length > 0 &&
      this.email().trim().length > 0 &&
      this.password().trim().length > 0 &&
      this.confirmPassword().trim().length > 0 &&
      !this.passwordsMismatch &&
      !this.submitting()
    );
  }

  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}

  async signup(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.errorMessage.set('');
    this.submitting.set(true);
    try {
      const { needsEmailConfirmation } = await this.authService.signUp(
        this.email().trim(),
        this.password(),
        this.fullName().trim(),
      );
      if (needsEmailConfirmation) {
        this.needsEmailConfirmation.set(true);
      } else {
        this.router.navigate(['/']);
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not create your account. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
