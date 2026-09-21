import { Injectable, computed, inject, signal } from '@angular/core';
import { Supabase } from './supabase';

/** Turns the stored role ('admin') into the label shown in the header. */
function roleLabel(role: string): string {
  return role === 'admin' ? 'Administrator' : role.charAt(0).toUpperCase() + role.slice(1);
}

/** Who is allowed into the admin area. The real gate is server-side: every
 * admin_* database function refuses to run unless the caller is in
 * admin_users. This service only asks the same question up front, so the
 * route guard can turn non-admins away and the header can show the role. */
@Injectable({ providedIn: 'root' })
export class AdminAccessService {
  private client = inject(Supabase).getClient();

  /** Raw role from admin_users, null until loaded or when not an admin. */
  private role = signal<string | null>(null);
  roleText = computed(() => {
    const role = this.role();
    return role ? roleLabel(role) : '';
  });

  /** Returns the caller's admin role, or null when they are not an admin.
   * Throws if the check itself fails (network error, or the database
   * function has not been installed yet). */
  async loadRole(): Promise<string | null> {
    const { data, error } = await this.client.rpc('admin_role');
    if (error) {
      throw error;
    }
    const role = (data as string | null) ?? null;
    this.role.set(role);
    return role;
  }
}
