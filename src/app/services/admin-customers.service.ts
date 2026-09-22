import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { AdminCustomer } from '../models/admin-customer.model';

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  joined_at: string;
  total_bookings: number;
  total_spent: string | number;
  last_booking_at: string | null;
}

function mapCustomerRow(row: CustomerRow): AdminCustomer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    joinedAt: row.joined_at,
    totalBookings: row.total_bookings,
    totalSpent: Number(row.total_spent),
    lastBookingAt: row.last_booking_at,
  };
}

/** Admin-wide customer data, via the admin_get_customers() function in
 * supabase/sql/2026-09-22-admin-customers.sql. Unlike routes/trips, there is
 * no public read policy on auth.users/bookings/passengers, so this goes
 * through a SECURITY DEFINER function rather than a direct table select. */
@Injectable({ providedIn: 'root' })
export class AdminCustomersService {
  private client = inject(Supabase).getClient();

  async list(): Promise<AdminCustomer[]> {
    const { data, error } = await this.client.rpc('admin_get_customers');
    if (error) {
      throw error;
    }
    return ((data ?? []) as CustomerRow[]).map(mapCustomerRow);
  }
}
