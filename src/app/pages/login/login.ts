import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  email = signal('');
  password = signal('');
  submitting = signal(false);
  errorMessage = signal('');

  get canSubmit(): boolean {
    return this.email().trim().length > 0 && this.password().trim().length > 0 && !this.submitting();
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
  ) {}

  async login(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.errorMessage.set('');
    this.submitting.set(true);
    try {
      await this.authService.signIn(this.email().trim(), this.password());
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
      this.router.navigateByUrl(returnUrl);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not log in. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
