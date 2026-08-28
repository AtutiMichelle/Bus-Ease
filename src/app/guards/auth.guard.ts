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
