import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthModalService } from '../services/auth-modal.service';
import { AdminAccessService } from '../services/admin-access.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const authModal = inject(AuthModalService);

  const session = await authService.getSession();
  if (session) {
    return true;
  }
  authModal.open('login', state.url);
  return false;
};

/** Gates the admin area. Signed-out visitors get the login modal; signed-in
 * users who are not in admin_users are sent home. If the admin check itself
 * fails (network error, or the database functions are not installed yet) the
 * guard fails closed and also sends the user home.
 *
 * This is a convenience, not the security boundary: every admin_* database
 * function re-checks admin access on the server, so a non-admin who got past
 * this guard would still receive no data. */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const authModal = inject(AuthModalService);
  const adminAccess = inject(AdminAccessService);
  const router = inject(Router);

  const session = await authService.getSession();
  if (!session) {
    authModal.open('login', state.url);
    return false;
  }

  try {
    if (await adminAccess.loadRole()) {
      return true;
    }
  } catch (error) {
    console.error('Admin access check failed', error);
  }
  return router.parseUrl('/');
};

/** Same as authGuard, but also lets a guest through with exactly one seat
 * (a single seat can be booked without an account; anything more needs a
 * login, enforced here as a backstop in case a guest reaches this URL
 * directly rather than through the seat panel's own check). */
export const bookingAccessGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const authModal = inject(AuthModalService);

  const session = await authService.getSession();
  if (session) {
    return true;
  }

  const seatsParam = route.queryParamMap.get('seats') ?? '';
  const seatCount = seatsParam ? seatsParam.split(',').filter(Boolean).length : 0;
  if (seatCount === 1) {
    return true;
  }

  authModal.open('login', state.url);
  return false;
};


