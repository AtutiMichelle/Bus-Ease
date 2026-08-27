import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

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

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
