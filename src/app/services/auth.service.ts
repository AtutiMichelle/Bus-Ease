import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

interface LoginResponse {
  session?: Session;
  error?: { message: string };
}

/** Thrown when the login function refuses the attempt because the email is
 * locked out, carrying the whole seconds left on the lock so the form can
 * count down instead of just showing a sentence. */
export class LoginLockedError extends Error {
  constructor(readonly retryAfter: number) {
    super('Too many failed attempts.');
    this.name = 'LoginLockedError';
  }
}

/** The login function answers a locked-out email with 429, and supabase-js
 * turns any non-2xx into a FunctionsHttpError whose body it never reads for
 * us -- the raw Response is on error.context, so the body has to be pulled
 * off that by hand. Anything that isn't a readable locked payload comes back
 * null and is handled as a plain failure. */
async function readRetryAfter(error: unknown): Promise<number | null> {
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.json !== 'function' || context.status !== 429) {
    return null;
  }
  try {
    const body = await context.json();
    if (body?.error === 'locked' && Number.isFinite(Number(body.retryAfter))) {
      return Math.max(0, Math.ceil(Number(body.retryAfter)));
    }
  } catch {
    // Body already consumed or not JSON: fall through to a plain failure.
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private client = inject(Supabase).getClient();

  session = signal<Session | null>(null);
  user = computed(() => this.session()?.user ?? null);
  displayName = computed(
    () => (this.user()?.user_metadata?.['name'] as string | undefined) ?? this.user()?.email ?? '',
  );

  constructor() {
    this.client.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

 
  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async signUp(email: string, password: string, name: string): Promise<{ needsEmailConfirmation: boolean }> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) {
      throw error;
    }
    return { needsEmailConfirmation: !data.session };
  }

  /** Goes through the "login" edge function rather than calling
   * signInWithPassword() directly, so repeated failures can be locked out
   * server-side (see supabase/functions/login) — Supabase's own hook for
   * this needs a paid plan this project isn't on. The function does the
   * real credential check itself and hands back a session on success,
   * which is then set locally exactly like a direct sign-in would. */
  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.functions.invoke<LoginResponse>('login', {
      body: { email, password },
    });
    if (error) {
      const retryAfter = await readRetryAfter(error);
      if (retryAfter !== null) {
        throw new LoginLockedError(retryAfter);
      }
      throw new Error('Could not log in. Please try again.');
    }
    if (data?.error) {
      throw new Error(data.error.message);
    }
    if (!data?.session) {
      throw new Error('Could not log in. Please try again.');
    }

    const { error: setSessionError } = await this.client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setSessionError) {
      throw setSessionError;
    }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  /** Emails a time-limited, single-use recovery link (Supabase issues and
   * expires it; the app never sees or handles the token itself beyond the
   * redirect). Always resolves without revealing whether the email is
   * registered, so this can't be used to enumerate accounts. */
  async resetPasswordForEmail(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      throw error;
    }
  }

  async updateProfile(data: { name: string; phone?: string }): Promise<void> {
    const { error } = await this.client.auth.updateUser({
      data: { ...this.user()?.user_metadata, ...data },
    });
    if (error) {
      throw error;
    }
  }

  /** Raw event stream, needed by the reset-password page to catch the
   * PASSWORD_RECOVERY event Supabase fires once it's parsed the token from
   * the emailed link — that's the only reliable signal that the link was
   * valid (a plain getSession() call could race the token exchange). */
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.client.auth.onAuthStateChange(callback);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) {
      throw error;
    }
  }

  /** Supabase has no standalone "check this password" call — signing in
   * again with it is the only way to verify it's correct. A success just
   * refreshes the existing session for the same user. */
  async verifyPassword(password: string): Promise<boolean> {
    const email = this.user()?.email;
    if (!email) {
      return false;
    }
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return !error;
  }

  /** Permanently deletes the signed-in user's own account. Runs entirely
   * through delete_own_account() (see supabase/sql) — deleting a user isn't
   * something the client's anon/authenticated key can ever be trusted to do
   * directly, so this is the one narrow, server-checked door for it. */
  async deleteOwnAccount(): Promise<void> {
    const { error } = await this.client.rpc('delete_own_account');
    if (error) {
      throw error;
    }
    await this.client.auth.signOut();
  }
}
