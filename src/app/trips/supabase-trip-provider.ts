import { Injectable, inject } from '@angular/core';
import { Supabase } from '../services/supabase';
import { AuthService } from '../services/auth.service';
import { BusService } from '../services/bus.service';
import { BookingService } from '../services/booking.service';
import {
  BoardingDroppingPoints,
  BookingHold,
  City,
  PaymentStart,
  PaymentStatus,
  PrintableTicket,
  SeatLayout,
  Trip,
  TripSearchContext,
} from '../models/trip.model';
import { getGuestToken } from '../utils/guest-token';
import { BookingRequest, TripProvider } from './trip-provider';
import { TripApiError } from './trip-errors';
import { seatLayoutFromSeats, tripFromBus } from './supabase-trip.adapters';

/** reserve_seats holds seats for this long. */
const HOLD_MINUTES = 15;

const STORAGE_KEY = 'busease_supabase_pending_bookings';

/** A hold waiting for payment. Supabase only writes the booking once
 * payment succeeds, so everything confirm_booking needs is kept until then. */
interface PendingBooking {
  busId: string;
  seatNumbers: string[];
  heldBy: string;
  passengers: { seatNumber: string; fullName: string; mobile: string }[];
  contactEmail: string;
  paymentReference?: string;
  /** Set once confirm_booking has run, so a repeat check doesn't book twice. */
  bookingReference?: string;
}

function readPending(): Record<string, PendingBooking> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PendingBooking>) : {};
  } catch {
    return {};
  }
}

function writePending(pending: Record<string, PendingBooking>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Storage blocked: the hold still works for this page visit, it just
    // won't survive a reload.
  }
}

function shortId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Turns a Supabase or RPC failure into a TripApiError with a customer-safe message. */
function toTripError(error: unknown, fallback: string): TripApiError {
  if (error instanceof TripApiError) {
    return error;
  }
  const raw = (error as { message?: string } | null)?.message ?? '';
  if (/no longer available/i.test(raw)) {
    return new TripApiError('One or more of your seats were just taken. Please pick different seats.', 'SEAT_UNAVAILABLE', null, raw);
  }
  if (/expired/i.test(raw)) {
    return new TripApiError('Your booking hold has expired. Please select your seats again.', 'BOOKING_EXPIRED', null, raw);
  }
  return new TripApiError(fallback, null, null, raw || null);
}

/** Books against BusEase's own Supabase tables, behind the same interface as
 * the Travler API. There's no real payment gateway here yet: the M-Pesa
 * prompt is simulated, and the first payment check confirms the booking. */
@Injectable({ providedIn: 'root' })
export class SupabaseTripProvider implements TripProvider {
  readonly holdMinutes = HOLD_MINUTES;

  private client = inject(Supabase).getClient();
  private authService = inject(AuthService);
  private busService = inject(BusService);
  private bookingService = inject(BookingService);
  private cityCache = new Map<string, Promise<City[]>>();

  private heldBy(): string {
    return this.authService.user()?.id ?? getGuestToken();
  }

  /** Cities are just the town names on the routes table, so a city's id is its name. */
  getCities(sourceCityId?: string): Promise<City[]> {
    const key = sourceCityId ?? '';
    const cached = this.cityCache.get(key);
    if (cached) {
      return cached;
    }
    const pending = this.loadCities(sourceCityId);
    this.cityCache.set(key, pending);
    // Don't keep a failed lookup around, so the next attempt actually retries.
    pending.catch(() => this.cityCache.delete(key));
    return pending;
  }

  private async loadCities(sourceCityId?: string): Promise<City[]> {
    let query = this.client.from('routes').select('origin, destination');
    if (sourceCityId) {
      query = query.ilike('origin', sourceCityId.trim());
    }
    const { data, error } = await query;
    if (error) {
      throw toTripError(error, "We couldn't load the list of cities.");
    }
    const names = new Map<string, string>();
    for (const row of (data ?? []) as { origin: string; destination: string }[]) {
      const name = (sourceCityId ? row.destination : row.origin).trim();
      names.set(name.toLowerCase(), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b)).map((name) => ({ id: name, name }));
  }

  async searchTrips(context: TripSearchContext): Promise<Trip[]> {
    try {
      const buses = await this.busService.search(context.from, context.to, context.date);
      return buses.map((bus) => tripFromBus(bus, context));
    } catch (error) {
      throw toTripError(error, "We couldn't load trips for this route. Please try again.");
    }
  }

  async getSeatLayout(trip: Trip): Promise<SeatLayout> {
    try {
      const [bus, seats] = await Promise.all([this.busService.getById(trip.id), this.busService.getSeats(trip.id, this.heldBy())]);
      return seatLayoutFromSeats(seats, bus?.price ?? trip.fromPrice);
    } catch (error) {
      throw toTripError(error, "We couldn't load the seat map. Please try again.");
    }
  }

  /** Supabase has no stops yet, so the bus's own start and end towns stand in. */
  async getBoardingDroppingPoints(trip: Trip): Promise<BoardingDroppingPoints> {
    return {
      boarding: [{ id: 'origin', name: trip.from, time: trip.departureTime }],
      dropping: [{ id: 'destination', name: trip.to, time: trip.arrivalTime }],
    };
  }

  async createBooking(booking: BookingRequest): Promise<BookingHold> {
    const heldBy = this.heldBy();
    const seatNumbers = booking.passengers.map((p) => p.seatName);
    let reservedUntil: string;
    try {
      reservedUntil = await this.bookingService.reserveSeats(booking.trip.id, seatNumbers, heldBy, HOLD_MINUTES);
    } catch (error) {
      throw toTripError(error, "We couldn't reserve your seats. Please try again.");
    }

    const reference = shortId('HOLD');
    const pending = readPending();
    pending[reference] = {
      busId: booking.trip.id,
      seatNumbers,
      heldBy,
      // Supabase keeps a mobile per passenger; the contact number fills it.
      passengers: booking.passengers.map((p) => ({ seatNumber: p.seatName, fullName: p.fullName, mobile: booking.contact.phone })),
      contactEmail: booking.contact.email,
    };
    writePending(pending);

    return {
      reference,
      status: 'pending_payment',
      // Seat prices come straight from bus_classes, the same figures confirm_booking sums.
      totalAmount: booking.totalAmount,
      currency: 'KES',
      heldUntil: new Date(reservedUntil).toISOString(),
    };
  }

  async startMpesaPayment(bookingReference: string): Promise<PaymentStart> {
    const pending = readPending();
    const hold = pending[bookingReference];
    if (!hold) {
      throw new TripApiError('Your booking hold has expired. Please select your seats again.', 'BOOKING_EXPIRED', null, null);
    }
    hold.paymentReference = shortId('SIM');
    writePending(pending);
    return { reference: hold.paymentReference, status: 'pending' };
  }

  async checkMpesaPayment(paymentReference: string): Promise<PaymentStatus> {
    const pending = readPending();
    const entry = Object.entries(pending).find(([, hold]) => hold.paymentReference === paymentReference);
    if (!entry) {
      throw new TripApiError("We couldn't find this payment. Please try again.", 'NOT_FOUND', null, null);
    }
    const [holdReference, hold] = entry;

    if (!hold.bookingReference) {
      const bus = await this.busService.getById(hold.busId);
      if (!bus) {
        throw new TripApiError("We couldn't find this bus any more.", 'NOT_FOUND', null, null);
      }
      try {
        hold.bookingReference = await this.bookingService.confirmBooking(bus, hold.passengers, hold.heldBy, hold.contactEmail);
      } catch (error) {
        throw toTripError(error, "We couldn't confirm your booking.");
      }
      pending[holdReference] = hold;
      writePending(pending);
    }

    return {
      reference: paymentReference,
      state: 'success',
      ticketNumber: hold.bookingReference,
      bookingReference: hold.bookingReference,
    };
  }

  /** No printable PDF from Supabase; the ticket page shows its on-screen copy instead. */
  async getPrintableTicket(ticketNumber: string): Promise<PrintableTicket> {
    return { ticketNumber, url: '' };
  }
}
