import { Component, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminRoutesService } from '../../../services/admin-routes.service';
import { AdminRoute, RouteFormValue } from '../../../models/admin-fleet.model';

/** Create/edit modal for one route. A null `route` input means create.
 * Owns its own save call (like AuthModal owns its own sign-in call), so the
 * page just reloads its list when `saved` fires. */
@Component({
  imports: [FormsModule],
  selector: 'app-route-form',
  styleUrl: './route-form.css',
  templateUrl: './route-form.html',
})
export class RouteForm implements OnInit {
  private routesService = inject(AdminRoutesService);

  route = input<AdminRoute | null>(null);
  saved = output<void>();
  closed = output<void>();

  origin = signal('');
  destination = signal('');
  durationMinutes = signal<number | null>(null);

  submitting = signal(false);
  error = signal('');

  ngOnInit(): void {
    const existing = this.route();
    if (existing) {
      this.origin.set(existing.origin);
      this.destination.set(existing.destination);
      this.durationMinutes.set(existing.durationMinutes);
    }
  }

  get isEdit(): boolean {
    return this.route() !== null;
  }

  get sameOrigin(): boolean {
    return this.origin().trim().length > 0 && this.origin().trim().toLowerCase() === this.destination().trim().toLowerCase();
  }

  get canSubmit(): boolean {
    return (
      this.origin().trim().length > 0 &&
      this.destination().trim().length > 0 &&
      !this.sameOrigin &&
      (this.durationMinutes() ?? 0) > 0 &&
      !this.submitting()
    );
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.submitting()) {
      this.closed.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.submitting()) {
      this.closed.emit();
    }
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    const value: RouteFormValue = {
      origin: this.origin().trim(),
      destination: this.destination().trim(),
      durationMinutes: this.durationMinutes()!,
    };
    try {
      const existing = this.route();
      if (existing) {
        await this.routesService.update(existing.id, value);
      } else {
        await this.routesService.create(value);
      }
      this.saved.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not save the route. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
