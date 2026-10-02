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
import { BookingContact, TripPassenger } from '../models/booking.model';

/** Which trip source the app books against, set in environment.ts. */
export type TripProviderName = 'travler' | 'supabase';

export interface BookingRequest {
  trip: Trip;
  boardingPointId: string;
  droppingPointId: string;
  passengers: TripPassenger[];
  contact: BookingContact;
  totalAmount: number;
}

/** Everything the booking pages need from a trip source. Each provider
 * returns the same BusEase models and throws TripApiError on failure, so
 * pages never need to know which one is live. */
export interface TripProvider {
  /** How long an unpaid booking holds its seats. */
  readonly holdMinutes: number;

  /** Source cities when no `sourceCityId` is given, otherwise the
   * destinations reachable from it. */
  getCities(sourceCityId?: string): Promise<City[]>;
  searchTrips(context: TripSearchContext, passengerCount?: number): Promise<Trip[]>;
  getSeatLayout(trip: Trip): Promise<SeatLayout>;
  getBoardingDroppingPoints(trip: Trip): Promise<BoardingDroppingPoints>;
  /** Holds the seats unpaid for `holdMinutes`. */
  createBooking(booking: BookingRequest): Promise<BookingHold>;
  /** Sends the M-Pesa prompt to `phone` (2547XXXXXXXX). */
  startMpesaPayment(bookingReference: string, phone: string, totalAmount: number): Promise<PaymentStart>;
  checkMpesaPayment(paymentReference: string): Promise<PaymentStatus>;
  /** `url` is empty when the source has no printable ticket. */
  getPrintableTicket(ticketNumber: string): Promise<PrintableTicket>;
}
