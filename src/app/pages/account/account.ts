import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [RouterLink, FormsModule],
  selector: 'app-account',
  styleUrl: './account.css',
  templateUrl: './account.html',
})
export class Account {
  authService = inject(AuthService);

  name = signal(this.authService.user()?.user_metadata?.['name'] ?? '');
  newPassword = signal('');
  confirmPassword = signal('');

  savingProfile = signal(false);
  profileMessage = signal('');
  profileError = signal('');

  savingPassword = signal(false);
  passwordMessage = signal('');
  passwordError = signal('');

  async saveProfile(): Promise<void> {
    this.profileMessage.set('');
    this.profileError.set('');
    this.savingProfile.set(true);
    try {
      await this.authService.updateProfile(this.name().trim());
      this.profileMessage.set('Profile updated.');
    } catch (error) {
      this.profileError.set(error instanceof Error ? error.message : 'Could not update your profile. Please try again.');
    } finally {
      this.savingProfile.set(false);
    }
  }

  async savePassword(): Promise<void> {
    this.passwordMessage.set('');
    this.passwordError.set('');

    if (this.newPassword().length < 6) {
      this.passwordError.set('Password must be at least 6 characters.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('Passwords do not match.');
      return;
    }

    this.savingPassword.set(true);
    try {
      await this.authService.updatePassword(this.newPassword());
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.passwordMessage.set('Password updated.');
    } catch (error) {
      this.passwordError.set(error instanceof Error ? error.message : 'Could not update your password. Please try again.');
    } finally {
      this.savingPassword.set(false);
    }
  }
}
