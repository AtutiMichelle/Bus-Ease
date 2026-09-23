import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-forgot-password',
  styleUrl: './forgot-password.css',
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  email = signal('');
  submitting = signal(false);
  submitted = signal(false);
  error = signal('');

  constructor(private authService: AuthService) {}

  get canSubmit(): boolean {
    return this.email().trim().length > 0 && !this.submitting();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    try {
      await this.authService.resetPasswordForEmail(this.email().trim());
      // Shown on both success and failure to avoid confirming which emails
      // have an account.
      this.submitted.set(true);
    } catch {
      this.submitted.set(true);
    } finally {
      this.submitting.set(false);
    }
  }
}
