import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environment';
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
} from '../../../models/trip.model';
import { BookingRequest, TripProvider } from '../../trip-provider';
import {
  BOOKING_HOLD_MINUTES,
  adaptBooking,
  adaptCity,
  adaptPaymentStart,
  adaptPaymentStatus,
  adaptPoints,
  adaptPrint,
  adaptSeatLayout,
  adaptTrip,
} from './travler.adapters';
import { TravlerApiError, errorFromBody, toTravlerError } from './travler-errors';
import {
  TravlerBookingPassenger,
  TravlerBookingRequest,
  TravlerBookingResponse,
  TravlerCity,
  TravlerCityRequest,
  TravlerEnvelope,
  TravlerFilterBusesRequest,
  TravlerPaymentCheck,
  TravlerPaymentCheckRequest,
  TravlerPaymentInitRequest,
  TravlerPaymentInitResponse,
  TravlerPointsResponse,
  TravlerPointsRequest,
  TravlerPrint,
  TravlerPrintRequest,
  TravlerSeatLayoutRequest,
  TravlerSeatLayoutResponse,
  TravlerTrip,
} from './travler.types';

/** The only place that talks to the Travler API. Each method maps to one
 * endpoint (paths are case sensitive and deliberately inconsistent, they
 * match the API as-is), turns failures into TravlerApiError with a friendly
 * message, and returns clean BusEase models. */
@Injectable({ providedIn: 'root' })
export class TravlerApiService implements TripProvider {
  readonly holdMinutes = BOOKING_HOLD_MINUTES;
  private http = inject(HttpClient);
  private baseUrl = environment.travlerApiUrl.replace(/\/+$/, '');
  private cityCache = new Map<string, Promise<City[]>>();

  /** POST and unwrap: throws on non-2xx, and on any body with isSuccess: false. */
  private async post<T extends { isSuccess?: boolean }>(path: string, body: object, fallback: string): Promise<T> {
    let response: T;
    try {
      response = await firstValueFrom(this.http.post<T>(`${this.baseUrl}${path}`, body));
    } catch (error) {
      throw toTravlerError(error, fallback);
    }
    if (!response || response.isSuccess === false) {
      throw errorFromBody(response, fallback);
    }
    return response;
  }

  /** POST /common/getCity. Source cities when no `sourceCityId` is given,
   * otherwise the destinations reachable from it. Cached per source. */
  getCities(sourceCityId?: string): Promise<City[]> {
    const key = sourceCityId ?? '';
    const cached = this.cityCache.get(key);
    if (cached) {
      return cached;
    }
    const request: TravlerCityRequest = sourceCityId
      ? { city_id: sourceCityId, city_type: 'destination' }
      : { city_id: 0, city_type: 'source' };
    const pending = this.post<TravlerEnvelope<TravlerCity[]>>('/common/getCity', request, "We couldn't load the list of cities.")
      .then((res) => (res.data ?? []).map(adaptCity));
    this.cityCache.set(key, pending);
    // Don't keep a failed lookup around, so the next attempt actually retries.
    pending.catch(() => this.cityCache.delete(key));
    return pending;
  }

  /** POST /Trips/filterBuses. Travler takes no passenger count: the seat
   * map shows what is free. */
  async searchTrips(context: TripSearchContext): Promise<Trip[]> {
    const request: TravlerFilterBusesRequest = {
      source_city_id: context.fromCityId,
      destination_city_id: context.toCityId,
      travel_date: context.date,
    };
    const res = await this.post<TravlerEnvelope<TravlerTrip[]>>(
      '/Trips/filterBuses',
      request,
      "We couldn't load trips for this route. Please try again.",
    );
    return (res.data ?? []).map((trip) => adaptTrip(trip, context));
  }

  /** POST /trips/getTripSeatsPrice */
  async getSeatLayout(trip: Trip): Promise<SeatLayout> {
    const request: TravlerSeatLayoutRequest = {
      source_city_id: trip.fromCityId,
      destination_city_id: trip.toCityId,
      travel_date: trip.date,
      bus_id: trip.id,
      delayedFlag: trip.delay?.flag ?? 0,
      delayedDate: trip.delay?.date ?? 0,
    };
    const res = await this.post<TravlerSeatLayoutResponse>(
      '/trips/getTripSeatsPrice',
      request,
      "We couldn't load the seat map. Please try again.",
    );
    return adaptSeatLayout(res);
  }

  /** POST /trips/getBoardingDroppingPoints */
  async getBoardingDroppingPoints(trip: Trip): Promise<BoardingDroppingPoints> {
    const request: TravlerPointsRequest = {
      source: trip.fromCityId,
      destination: trip.toCityId,
      trip: trip.id,
      booking_date: trip.date,
      delayedFlag: trip.delay?.flag ?? 0,
      delayedDate: trip.delay?.date ?? 0,
    };
    const res = await this.post<TravlerPointsResponse>(
      '/trips/getBoardingDroppingPoints',
      request,
      "We couldn't load boarding and drop-off points. Please try again.",
    );
    return adaptPoints(res);
  }

  /** POST /Ticket/RoundBooking, one way. Holds the seats unpaid for
   * BOOKING_HOLD_MINUTES. Every passenger gets the contact phone and email. */
  async createBooking(booking: BookingRequest): Promise<BookingHold> {
    const fallback = "We couldn't reserve your seats. Please try again.";
    const { trip, contact } = booking;
    const request: TravlerBookingRequest = {
      bus_id: trip.id,
      booking_date: trip.date,
      pickup_id: trip.fromCityId,
      return_id: trip.toCityId,
      source_city: trip.from,
      dest_city: trip.to,
      boardingPointId: booking.boarding.id,
      droppingPointId: booking.dropping.id,
      boardingPointname: booking.boarding.name,
      droppingPointname: booking.dropping.name,
      passenger: booking.passengers.map((p) => ({
        seat_id: p.seatId,
        name: p.firstName.trim(),
        last_name: p.lastName.trim(),
        // The details form won't submit without one.
        gender: p.gender as TravlerBookingPassenger['gender'],
        age: p.age.trim(),
        mobileId: contact.phone.slice(0, 3),
        mobile: contact.phone.slice(3),
        nationality: p.nationality.trim(),
        id_no: p.idNumber.trim(),
        email: contact.email.trim(),
      })),
      c_email: contact.email.trim(),
      contact_phone: contact.phone,
    };
    const res = await this.post<TravlerBookingResponse>('/Ticket/RoundBooking', request, fallback);
    if (res.alreadySeatBooked?.length) {
      throw new TravlerApiError(
        'One or more of your seats were just taken. Please pick different seats.',
        'SEAT_UNAVAILABLE',
        null,
        res.message ?? null,
      );
    }
    if (!res.booking_reference) {
      throw errorFromBody(res, fallback);
    }
    return adaptBooking(res, booking.totalAmount);
  }

  /** POST /paymentGateway/init. Sends the M-Pesa STK push to `phone` (2547XXXXXXXX). */
  async startMpesaPayment(bookingReference: string, phone: string): Promise<PaymentStart> {
    const request: TravlerPaymentInitRequest = {
      bookingRef: bookingReference,
      queryoption: 2,
      queryvalue: phone,
      requestType: 'ticket',
      isWalletApply: false,
      additionalInfo: {
        onward: { sponsorTrip: false, discountId: 0 },
        return: { sponsorTrip: false, discountId: 0 },
      },
      paymentMethod: 'mpesa',
    };
    const res = await this.post<TravlerPaymentInitResponse>(
      '/paymentGateway/init',
      request,
      "We couldn't start the M-Pesa payment. Please try again.",
    );
    return adaptPaymentStart(res, bookingReference);
  }

  /** POST /paymentGateway/checkMpesaPayment */
  async checkMpesaPayment(paymentReference: string): Promise<PaymentStatus> {
    const request: TravlerPaymentCheckRequest = { payment_reference: paymentReference };
    const res = await this.post<TravlerEnvelope<TravlerPaymentCheck>>(
      '/paymentGateway/checkMpesaPayment',
      request,
      "We couldn't check your payment status.",
    );
    return res.data ? adaptPaymentStatus(res.data) : { reference: paymentReference, state: 'pending' };
  }

  /** POST /ticket/print */
  async getPrintableTicket(ticketNumber: string): Promise<PrintableTicket> {
    const request: TravlerPrintRequest = { ticket_number: ticketNumber };
    const res = await this.post<TravlerEnvelope<TravlerPrint>>(
      '/ticket/print',
      request,
      "We couldn't get a printable ticket right now.",
    );
    return adaptPrint(res.data ?? { printable_url: '' }, ticketNumber);
  }
}
