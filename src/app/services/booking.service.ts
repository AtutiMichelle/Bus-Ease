import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { AuthService } from './auth.service';
import { BUS_ROW_SELECT, BusRow, mapBusRow } from './bus.service';
import { Bus } from '../models/bus.model';
import { PassengerInput, SavedBooking } from '../models/booking.model';

const REFERENCE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReference(): string {
  let reference = '';
  for (let i = 0; i < 8; i++) {
    reference += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return reference;
}

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

  /** Books the given seats for the current user, or returns the existing
   * booking's reference if this exact bus+seats combo was already booked
   * (protects against double-submitting the confirmation form). */
  async createBooking(bus: Bus, passengers: PassengerInput[]): Promise<string> {
    const user = this.authService.user();
    if (!user) {
      throw new Error('You must be logged in to book.');
    }
    if (passengers.length === 0) {
      throw new Error('Select at least one seat.');
    }

    const seatNumbers = passengers.map((p) => p.seatNumber);
    const { data: seatRows, error: seatsError } = await this.client
      .from('seats')
      .select('id, seat_number, status')
      .eq('bus_id', bus.id)
      .in('seat_number', seatNumbers);
    if (seatsError) {
      throw seatsError;
    }

    const foundNumbers = new Set((seatRows ?? []).map((s) => s.seat_number));
    const missing = seatNumbers.filter((n) => !foundNumbers.has(n));
    if (missing.length > 0) {
      throw new Error(`Seat(s) ${missing.join(', ')} could not be found for this bus.`);
    }

    const stillAvailable = (seatRows ?? []).every((s) => s.status === 'available');
    if (!stillAvailable) {
      throw new Error('One or more selected seats were just booked by someone else. Please pick different seats.');
    }

    const reference = generateReference();
    const { data: booking, error: bookingError } = await this.client
      .from('bookings')
      .insert({
        user_id: user.id,
        bus_id: bus.id,
        booking_reference: reference,
        contact_email: user.email,
        total_fare: bus.price * passengers.length,
        status: 'confirmed',
      })
      .select('id')
      .single();
    if (bookingError) {
      throw bookingError;
    }

    const seatIdByNumber = new Map((seatRows ?? []).map((s) => [s.seat_number, s.id]));
    const passengerRows = passengers.map((p) => ({
      booking_id: booking.id,
      seat_id: seatIdByNumber.get(p.seatNumber),
      full_name: p.fullName,
      mobile: p.mobile,
      age: p.age ?? null,
      gender: p.gender ?? null,
    }));
    const { error: passengersError } = await this.client.from('passengers').insert(passengerRows);
    if (passengersError) {
      throw passengersError;
    }

    const seatIds = (seatRows ?? []).map((s) => s.id);
    const { error: updateSeatsError } = await this.client.from('seats').update({ status: 'booked' }).in('id', seatIds);
    if (updateSeatsError) {
      throw updateSeatsError;
    }

    await this.client
      .from('buses')
      .update({ available_seats: Math.max(bus.seatsAvailable - passengers.length, 0) })
      .eq('id', bus.id);

    return reference;
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
