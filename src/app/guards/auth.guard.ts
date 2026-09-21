import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthModalService } from '../services/auth-modal.service';
import { StaffService } from '../services/staff.service';
import { AdminSection, canAccess } from '../admin/staff-access';

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

/** Gates the whole admin area: only staff get in. Signed-out visitors are
 * sent home with the login modal open; signed-in customers, and anyone whose
 * staff check fails (network error, or the database functions are not
 * installed yet), are sent home too. The guard fails closed.
 *
 * This is a convenience, not the security boundary. Row level security and
 * the admin-only database functions re-check the role on the server, so
 * someone who got past this guard would still receive no data. */
export const staffGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const authModal = inject(AuthModalService);
  const staff = inject(StaffService);
  const router = inject(Router);

  const session = await authService.getSession();
  if (!session) {
    authModal.open('login', state.url);
    return router.parseUrl('/');
  }

  try {
    if (await staff.ensureRole()) {
      return true;
    }
  } catch (error) {
    console.error('Staff access check failed', error);
  }
  return router.parseUrl('/');
};

/** Gates one admin page by the signed-in staff member's role (see
 * STAFF_ROLES in admin/staff-access.ts). Staff without access to the page
 * land on the "no access" page instead of an error. Like staffGuard, this
 * only decides what the app shows; the database enforces the real limits. */
export function sectionGuard(section: AdminSection): CanActivateFn {
  return async () => {
    const staff = inject(StaffService);
    const router = inject(Router);

    let role: string | null = null;
    try {
      role = await staff.ensureRole();
    } catch (error) {
      console.error('Staff access check failed', error);
    }

    if (canAccess(role, section)) {
      return true;
    }
    return router.parseUrl(role ? '/admin/no-access' : '/');
  };
}

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


