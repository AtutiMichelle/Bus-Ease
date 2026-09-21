import { Injectable, computed, inject, signal } from '@angular/core';
import { Supabase } from './supabase';
import { AuthService } from './auth.service';
import { firstOpenableItem } from '../admin/admin-nav';
import { roleLabel, sectionsForRole } from '../admin/staff-access';

/** The signed-in user's staff role. Loaded once per login from the
 * database (staff_users, via the staff_role() function) and kept in a
 * signal, so the route guards, the sidebar and the header all read the same
 * value without asking again on every page.
 *
 * Roles live only in the staff_users table, never in user_metadata (which
 * users can edit) or on the customer users table. The database is what
 * enforces access; this service only lets the app show the right things. */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private client = inject(Supabase).getClient();
  private authService = inject(AuthService);

  /** The user's staff role, or null when they are not staff (or it has not
   * been loaded yet). */
  role = signal<string | null>(null);
  roleLabel = computed(() => roleLabel(this.role()));
  sections = computed(() => sectionsForRole(this.role()));

  /** Where this staff member should land: the first admin page their role
   * can open (the dashboard for admins, Bookings for customer care). Null
   * for customers and for roles with nothing to open. */
  homeLink = computed(() => {
    const item = firstOpenableItem(this.sections());
    if (!item?.route) {
      return null;
    }
    return { route: item.route, label: item.route === '/admin' ? 'Dashboard' : 'Staff area' };
  });

  private loadedFor: string | null = null;
  private inFlight: { userId: string; promise: Promise<string | null> } | null = null;

  constructor() {
    // Forget the role as soon as someone signs out, so a stale role never
    // shows on the next login. Listening to the sign-out event itself (not
    // the session signal, which starts out null while the session loads)
    // means this can never clear a role that was just loaded.
    this.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.reset();
      }
    });
  }

  /** Returns the signed-in user's staff role, asking the database only the
   * first time for each login. Null means signed out or not staff. Throws
   * if the check itself fails (network error, or the database functions
   * are not installed yet); failures are not remembered, so the next call
   * tries again. */
  async ensureRole(): Promise<string | null> {
    const session = await this.authService.getSession();
    const userId = session?.user.id ?? null;
    if (!userId) {
      this.reset();
      return null;
    }
    if (this.loadedFor === userId) {
      return this.role();
    }
    if (this.inFlight?.userId === userId) {
      return this.inFlight.promise;
    }

    const promise = this.fetchRole().then(
      (role) => {
        this.role.set(role);
        this.loadedFor = userId;
        this.inFlight = null;
        return role;
      },
      (error) => {
        this.inFlight = null;
        throw error;
      },
    );
    this.inFlight = { userId, promise };
    return promise;
  }

  private async fetchRole(): Promise<string | null> {
    const { data, error } = await this.client.rpc('staff_role');
    if (error) {
      throw error;
    }
    return (data as string | null) ?? null;
  }

  private reset(): void {
    this.role.set(null);
    this.loadedFor = null;
    this.inFlight = null;
  }
}
