import { Injectable, signal } from '@angular/core';

export type AuthModalMode = 'login' | 'signup' | null;

@Injectable({ providedIn: 'root' })
export class AuthModalService {
  mode = signal<AuthModalMode>(null);
  returnUrl = signal<string | null>(null);

  /** Opens the modal. Omitting `returnUrl` leaves the existing one in place,
   * so switching between login/signup inside an already-open modal (or a
   * guard-triggered open) doesn't lose the destination to redirect to after
   * a successful sign-in. Pass an explicit value to set or clear it. */
  open(mode: 'login' | 'signup' = 'login', returnUrl?: string): void {
    this.mode.set(mode);
    if (returnUrl !== undefined) {
      this.returnUrl.set(returnUrl);
    }
  }

  close(): void {
    this.mode.set(null);
    this.returnUrl.set(null);
  }
}
