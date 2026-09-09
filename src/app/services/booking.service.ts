import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { AuthService } from './auth.service';
import { BUS_ROW_SELECT, BusRow, mapBusRow } from './bus.service';
import { Bus } from '../models/bus.model';
import { PassengerInput, SavedBooking } from '../models/booking.model';

interface BookingRow {
  booking_reference: string;
  total_fare: string | number;
  created_at: string;
  buses: BusRow;
  passengers: { seats: { seat_number: string } | null }[];
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private client = inject(Supabase).getClient();
  private authService = inject(AuthService);

  /** Places a temporary hold (default 15 min) on the given seats, atomically
   * — either every seat is claimed or none are. Returns when the hold
   * expires, so the payment page can count it down. `heldBy` is the
   * logged-in user's id, or a per-browser token for guests, so the same
   * caller reloading or retrying refreshes their own hold instead of
   * failing against it. */
  async reserveSeats(busId: string, seatNumbers: string[], heldBy: string, holdMinutes = 15): Promise<string> {
    const { data, error } = await this.client.rpc('reserve_seats', {
      p_bus_id: busId,
      p_seat_numbers: seatNumbers,
      p_held_by: heldBy,
      p_hold_minutes: holdMinutes,
    });
    if (error) {
      throw error;
    }
    return data as string;
  }

  /** Turns a valid hold into a real booking: verifies every seat is still
   * held by `heldBy` and hasn't expired, then creates the booking and
   * passenger rows, marks the seats booked, and decrements the bus's
   * available_seats — all atomically, server-side. Works for both a
   * logged-in booking and a guest one (pass a null user/email for guests). */
  async confirmBooking(bus: Bus, passengers: PassengerInput[], heldBy: string): Promise<string> {
    const user = this.authService.user();
    const { data, error } = await this.client.rpc('confirm_booking', {
      p_bus_id: bus.id,
      p_seat_numbers: passengers.map((p) => p.seatNumber),
      p_held_by: heldBy,
      p_user_id: user?.id ?? null,
      p_contact_email: user?.email ?? null,
      p_passengers: passengers.map((p) => ({
        seat_number: p.seatNumber,
        full_name: p.fullName,
        mobile: p.mobile,
        age: p.age ?? null,
        gender: p.gender ?? null,
      })),
    });
    if (error) {
      throw error;
    }
    return data as string;
  }

  async getMyBookings(): Promise<SavedBooking[]> {
    const user = this.authService.user();
    if (!user) {
      return [];
    }

    const { data, error } = await this.client
      .from('bookings')
      .select(`booking_reference, total_fare, created_at, buses!inner(${BUS_ROW_SELECT}), passengers(seats(seat_number))`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }

    return ((data ?? []) as unknown as BookingRow[]).map((row) => ({
      reference: row.booking_reference,
      bus: mapBusRow(row.buses),
      seats: row.passengers.map((p) => p.seats?.seat_number).filter((n): n is string => !!n),
      total: Number(row.total_fare),
      bookedAt: row.created_at,
    }));
  }
}
