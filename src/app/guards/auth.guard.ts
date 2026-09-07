import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthModalService } from '../services/auth-modal.service';

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


