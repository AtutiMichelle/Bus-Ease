import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environment';
import {
  BoardingDroppingPoints,
  BookingHold,
  City,
  PaymentStart,
  PaymentStatus,
  PrintableTicket,
  SeatLayout,
  Trip,
} from '../models/trip.model';
import { BookingContact, TripPassenger } from '../models/booking.model';
import {
  TripSearchContext,
  adaptBooking,
  adaptCity,
  adaptPaymentStart,
  adaptPaymentStatus,
  adaptPoints,
  adaptPrint,
  adaptSeatLayout,
  adaptTrip,
} from './travler.adapters';
import { errorFromBody, toTravlerError } from './travler-errors';
import {
  TravlerBooking,
  TravlerBookingRequest,
  TravlerCity,
  TravlerCityRequest,
  TravlerEnvelope,
  TravlerFilterBusesRequest,
  TravlerPaymentCheck,
  TravlerPaymentCheckRequest,
  TravlerPaymentInit,
  TravlerPaymentInitRequest,
  TravlerPoints,
  TravlerPointsRequest,
  TravlerPrint,
  TravlerPrintRequest,
  TravlerSeatLayoutRequest,
  TravlerSeatLayoutResponse,
  TravlerTrip,
} from './travler.types';

export interface BookingRequest {
  trip: Trip;
  boardingPointId: string;
  droppingPointId: string;
  passengers: TripPassenger[];
  contact: BookingContact;
  totalAmount: number;
}

/** The only place that talks to the Travler API. Each method maps to one
 * endpoint (paths are case sensitive and deliberately inconsistent, they
 * match the API as-is), turns failures into TravlerApiError with a friendly
 * message, and returns clean BusEase models. */
@Injectable({ providedIn: 'root' })
export class TravlerApiService {
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
      : { city_id: null, city_type: 'source' };
    const pending = this.post<TravlerEnvelope<TravlerCity[]>>('/common/getCity', request, "We couldn't load the list of cities.")
      .then((res) => (res.data ?? []).map(adaptCity));
    this.cityCache.set(key, pending);
    // Don't keep a failed lookup around, so the next attempt actually retries.
    pending.catch(() => this.cityCache.delete(key));
    return pending;
  }

  /** POST /Trips/filterBuses */
  async searchTrips(context: TripSearchContext, passengerCount = 1): Promise<Trip[]> {
    const request: TravlerFilterBusesRequest = {
      source_city_id: context.fromCityId,
      destination_city_id: context.toCityId,
      travel_date: context.date,
      passenger_count: passengerCount,
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
    const request: TravlerSeatLayoutRequest = { bus_id: trip.id, route_id: trip.routeId, travel_date: trip.date };
    const res = await this.post<TravlerSeatLayoutResponse>(
      '/trips/getTripSeatsPrice',
      request,
      "We couldn't load the seat map. Please try again.",
    );
    return adaptSeatLayout(res);
  }

  /** POST /trips/getBoardingDroppingPoints */
  async getBoardingDroppingPoints(trip: Trip): Promise<BoardingDroppingPoints> {
    const request: TravlerPointsRequest = { bus_id: trip.id, route_id: trip.routeId };
    const res = await this.post<TravlerEnvelope<TravlerPoints>>(
      '/trips/getBoardingDroppingPoints',
      request,
      "We couldn't load boarding and drop-off points. Please try again.",
    );
    return adaptPoints(res.data);
  }

  /** POST /Ticket/RoundBooking. Holds the seats unpaid for 10 minutes. */
  async createBooking(booking: BookingRequest): Promise<BookingHold> {
    const request: TravlerBookingRequest = {
      bus_id: booking.trip.id,
      travel_date: booking.trip.date,
      boarding_point_id: booking.boardingPointId,
      dropping_point_id: booking.droppingPointId,
      passengers: booking.passengers.map((p) => ({
        name: p.fullName.trim(),
        id_number: p.idNumber.trim(),
        seat_number: p.seatName,
        seat_type: p.seatType,
      })),
      contact_email: booking.contact.email.trim(),
      contact_phone: booking.contact.phone,
      total_amount: booking.totalAmount,
    };
    const res = await this.post<TravlerEnvelope<TravlerBooking>>(
      '/Ticket/RoundBooking',
      request,
      "We couldn't reserve your seats. Please try again.",
    );
    if (!res.data?.booking_reference) {
      throw errorFromBody(res, "We couldn't reserve your seats. Please try again.");
    }
    return adaptBooking(res.data, booking.totalAmount);
  }

  /** POST /paymentGateway/init. Sends the M-Pesa STK push to `phone` (2547XXXXXXXX). */
  async startMpesaPayment(bookingReference: string, phone: string, totalAmount: number): Promise<PaymentStart> {
    const request: TravlerPaymentInitRequest = {
      bookingRef: bookingReference,
      queryoption: 1,
      queryvalue: phone,
      requestType: 'STK_PUSH',
      isWalletApply: false,
      additionalInfo: {
        onward: { sponsorTrip: false, discountId: null },
        return: { sponsorTrip: false, discountId: null },
      },
      total_amount: totalAmount,
      paymentMethod: 'mpesa',
      sourcetype: 'web',
    };
    const res = await this.post<TravlerEnvelope<TravlerPaymentInit>>(
      '/paymentGateway/init',
      request,
      "We couldn't start the M-Pesa payment. Please try again.",
    );
    if (!res.data?.payment_reference) {
      throw errorFromBody(res, "We couldn't start the M-Pesa payment. Please try again.");
    }
    return adaptPaymentStart(res.data);
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
