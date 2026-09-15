import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { RecentBooking } from '../models/admin-dashboard.model';

interface AdminBookingRow {
  booking_reference: string;
  contact_email: string | null;
  total_fare: string | number;
  created_at: string;
  buses: { routes: { origin: string; destination: string } };
  passengers: { full_name: string }[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Admin-wide booking data, real Supabase queries (unlike
 * AdminDashboardService, which is still all mock).
 *
 * TODO: this selects from `bookings` with no `user_id` filter, which is
 * exactly what an admin view needs, but RLS on that table is currently
 * scoped to `auth.uid() = user_id` (see BookingService.getMyBookings) with
 * no roles/profiles table yet to grant broader access (same gap as
 * guards/auth.guard.ts's adminGuard TODO). Until an admin-scoped RLS policy
 * exists, this will only return the signed-in admin's own bookings, same as
 * a regular customer. */
@Injectable({ providedIn: 'root' })
export class AdminBookingsService {
  private client = inject(Supabase).getClient();

  async getAllBookings(limit = 100): Promise<RecentBooking[]> {
    const { data, error } = await this.client
      .from('bookings')
      .select(
        'booking_reference, contact_email, total_fare, created_at, buses!inner(routes!inner(origin, destination)), passengers(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      throw error;
    }

    return ((data ?? []) as unknown as AdminBookingRow[]).map((row) => {
      const customerName = row.passengers[0]?.full_name ?? 'Guest';
      return {
        reference: row.booking_reference,
        customerName,
        customerInitials: initials(customerName),
        bookedAt: row.created_at,
        route: `${row.buses.routes.origin} → ${row.buses.routes.destination}`,
        amount: Number(row.total_fare),
        // Every row here comes from confirm_booking(), which only runs once
        // payment has gone through, and the bookings table has no
        // cancellation flag. So every real row is 'Paid'; 'Unpaid' and
        // 'Refunded' exist on the type so the UI is ready the day the
        // schema grows a real payment/cancellation status.
        status: 'Paid' as const,
      };
    });
  }
}
