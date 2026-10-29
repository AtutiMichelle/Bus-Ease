/* Raw Travler API shapes, exactly as the API sends and expects them.
 * Nothing outside src/app/trips/providers/travler should import these; pages use the clean
 * models in src/app/models instead (see travler.adapters.ts).
 *
 * Requests leave out the fields the `travler` edge function fills in itself
 * (sourcetype, the operator, the search filters): see
 * supabase/functions/travler/rules.ts. */

export interface TravlerErrorBody {
  code?: string;
  message?: string;
  /** Seconds to wait, sent with code RATE_LIMITED by the `travler` edge function. */
  retryAfter?: number;
}

/** The usual wrapper around every response except the seat layout. */
export interface TravlerEnvelope<T> {
  isSuccess: boolean;
  msg?: string;
  data?: T;
  error?: TravlerErrorBody;
}

/* POST /common/getCity */

export interface TravlerCityRequest {
  /** 0 for the list of source cities. */
  city_id: string | number;
  city_type: 'source' | 'destination';
}

export interface TravlerCity {
  id: number | string;
  city_name: string;
}

/* POST /Trips/filterBuses */

export interface TravlerFilterBusesRequest {
  source_city_id: string;
  destination_city_id: string;
  travel_date: string;
}

export interface TravlerTripPrice {
  currencyCode: string;
  amount: string;
  seatType: string;
}

export interface TravlerTrip {
  bus_id: string | number;
  company_name: string;
  company_id: string | number;
  /** The operator's token. The edge function takes it out before the
   * result reaches the browser. */
  token?: string;
  bus_type: string;
  route_id: string | number;
  /** Comma separated amenity ids, e.g. "1,2,3". No lookup endpoint yet. */
  amenities: string;
  departure_time: string;
  arrival_time: string;
  available_seat_count: number | string;
  /** "HH:MM" */
  total_journey_time: string;
  avg_rating: string | number | null;
  rating_count: string | number | null;
  multi_seat: boolean;
  defaultTripPriceList: TravlerTripPrice[];
  highWayDirectRoute?: string;
  trip_code?: string;
  ticket_amount?: string;
  company_logo?: string | null;
  isPromotional?: boolean;
  /** Not sent by the real API; the search date is used instead. */
  travel_date?: string;
  /** Delay markers, sent back on the seat and stop lookups. */
  delayedFlag?: number;
  /** Unix seconds. */
  delayedDate?: number | null;
}

/* POST /trips/getTripSeatsPrice
 * Note the different shape: no envelope `msg`, and priceList/seatsBooked sit
 * at the top level beside `data`. */

export interface TravlerSeatLayoutRequest {
  source_city_id: string;
  destination_city_id: string;
  travel_date: string;
  bus_id: string;
  delayedFlag: number;
  delayedDate: number;
}

export interface TravlerSeatPrice {
  currencyType: string;
  currencyId: string;
  price: string;
  tax: number | string;
}

export interface TravlerSeat {
  left: string;
  top: string;
  seat_id: string | number;
  seat_width: string;
  seat_height: string;
  seat_name: string;
  seat_type: string;
  seat_type_id: string | number;
  seat_color?: string;
  /** true means the seat is already taken. The driver and door cells
   * (seat_type "driver" and "door") come marked true as well. */
  selection_status: boolean;
}

export interface TravlerSeatLayoutResponse {
  isSuccess: boolean;
  priceList: Record<string, TravlerSeatPrice[]>;
  data: TravlerSeat[];
  seatsBooked: number | string;
  msg?: string;
  error?: TravlerErrorBody;
}

/* POST /trips/getBoardingDroppingPoints
 * Also its own shape: the two lists sit at the top level, not in `data`. */

export interface TravlerPointsRequest {
  source: string;
  destination: string;
  /** The bus id. */
  trip: string;
  booking_date: string;
  delayedFlag: number;
  delayedDate: number;
}

export interface TravlerPoint {
  id: string | number;
  name: string;
  /** Boarding points only, e.g. "09:30 PM". */
  departureTime?: string | null;
}

export interface TravlerPointsResponse {
  isSuccess: boolean;
  boarding?: TravlerPoint[];
  dropping?: TravlerPoint[];
  msg?: string;
  error?: TravlerErrorBody;
}

/* POST /Ticket/RoundBooking
 * What the browser sends. The `travler` edge function turns it into the
 * full Create Booking body from the API guide, adding the trip token, route,
 * times and prices from Travler itself. */

export interface TravlerBookingPassenger {
  seat_id: string;
  name: string;
  last_name: string;
  gender: 'M' | 'F';
  age: string;
  /** Country dialling code, "254". */
  mobileId: string;
  /** The number after the dialling code, 7XXXXXXXX or 1XXXXXXXX. */
  mobile: string;
  nationality: string;
  id_no: string;
  email: string;
}

export interface TravlerBookingRequest {
  bus_id: string;
  booking_date: string;
  /** Source and destination city ids. */
  pickup_id: string;
  return_id: string;
  source_city: string;
  dest_city: string;
  boardingPointId: string;
  droppingPointId: string;
  boardingPointname: string;
  droppingPointname: string;
  passenger: TravlerBookingPassenger[];
  c_email: string;
  /** 2547XXXXXXXX. Only used by the edge function's per-phone limit. */
  contact_phone: string;
}

/** Not wrapped in `data`. */
export interface TravlerBookingResponse {
  isSuccess: boolean;
  booking_reference?: string;
  /** One per passenger. */
  ticket_number?: string[];
  /** Seats someone else took first, when the booking partly failed. */
  alreadySeatBooked?: unknown[];
  message?: string;
  msg?: string;
  error?: TravlerErrorBody;
}

/* POST /paymentGateway/init */

export interface TravlerPaymentLegInfo {
  sponsorTrip: false;
  discountId: 0;
}

export interface TravlerPaymentInitRequest {
  bookingRef: string;
  /** 2: queryvalue is a phone number. */
  queryoption: 2;
  /** Payer phone, 2547XXXXXXXX */
  queryvalue: string;
  requestType: 'ticket';
  isWalletApply: false;
  additionalInfo: {
    onward: TravlerPaymentLegInfo;
    return: TravlerPaymentLegInfo;
  };
  paymentMethod: 'mpesa';
}

/** Not wrapped in `data`. Only says the prompt was sent, not that it was paid. */
export interface TravlerPaymentInitResponse {
  isSuccess: boolean;
  ticketNumber?: string;
  msg?: string;
  error?: TravlerErrorBody;
}

/* POST /paymentGateway/checkMpesaPayment */

export interface TravlerPaymentCheckRequest {
  payment_reference: string;
}

export interface TravlerPaymentCheck {
  payment_reference: string;
  booking_reference?: string;
  status: string;
  gateway_reference: string | null;
  ticketNumber?: string;
}

/* POST /ticket/print */

export interface TravlerPrintRequest {
  ticket_number: string;
}

export interface TravlerPrint {
  ticket_number?: string;
  printable_url: string;
}
