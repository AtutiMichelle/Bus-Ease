import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../environment';
import { AuthService } from '../services/auth.service';

const FUNCTIONS_URL = `${environment.supabase.url.replace(/\/+$/, '')}/functions/v1/`;

/** Adds the Supabase credentials to calls going to our own edge functions
 * (the `travler` proxy in production). Supabase needs the project key on
 * every call; the signed-in user's token goes along too, so a function can
 * tell who is calling. Guests are sent with the project key alone.
 *
 * Every other address is left untouched, so the key and token never leave
 * for a server that isn't ours (the local Travler mock, for one). */
export const supabaseAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(FUNCTIONS_URL)) {
    return next(req);
  }
  const key = environment.supabase.key;
  // A failed session lookup shouldn't block a guest-friendly call, so it
  // falls back to the project key rather than failing the request.
  const session = inject(AuthService)
    .getSession()
    .catch(() => null);
  return from(session).pipe(
    switchMap((current) =>
      next(req.clone({ setHeaders: { apikey: key, Authorization: `Bearer ${current?.access_token ?? key}` } })),
    ),
  );
};
