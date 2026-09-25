import { BusClassOption } from '../models/bus.model';
import {
  BoardingDroppingPoints,
  BookingHold,
  City,
  LayoutSeat,
  PaymentStart,
  PaymentState,
  PaymentStatus,
  PrintableTicket,
  SeatClassName,
  SeatLayout,
  StopPoint,
  Trip,
} from '../models/trip.model';
import {
  TravlerBooking,
  TravlerCity,
  TravlerPaymentCheck,
  TravlerPaymentInit,
  TravlerPoint,
  TravlerPoints,
  TravlerPrint,
  TravlerSeatLayoutResponse,
  TravlerTrip,
} from './travler.types';

/** The API holds an unpaid booking for this long. */
export const BOOKING_HOLD_MINUTES = 10;

/** IDs arrive as numbers on some endpoints and strings on others. */
export function toId(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Prices and counts arrive as strings like "1500.00". Returns null when
 * the value isn't a usable number, so callers can't silently price at 0. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

const SEAT_CLASS_BY_TYPE: Record<string, SeatClassName> = {
  vip: 'VIP',
  bclass: 'Business',
  business: 'Business',
  normal: 'Normal',
};

export function seatClassFor(type: string): SeatClassName | undefined {
  return SEAT_CLASS_BY_TYPE[type.trim().toLowerCase()];
}

function seatTypeLabel(type: string): string {
  const known = seatClassFor(type);
  if (known) {
    return known;
  }
  const trimmed = type.trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : 'Seat';
}

/** "09:00 AM" -> 9, "12:15 AM" -> 0. Falls back to a 24-hour "HH:MM". */
function parseHour(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):\d{2}\s*([AaPp][Mm])?$/);
  if (!match) {
    return 0;
  }
  const hour = Number(match[1]) % 24;
  const meridiem = match[2]?.toUpperCase();
  if (meridiem === 'AM') {
    return hour % 12;
  }
  if (meridiem === 'PM') {
    return (hour % 12) + 12;
  }
  return hour;
}

/** "06:20" -> "6h 20m", matching how durations read elsewhere in the app. */
function formatJourneyTime(raw: string): string {
  const match = raw.trim().match(/^(\d{1,3}):(\d{1,2})/);
  if (!match) {
    return raw;
  }
  return `${Number(match[1])}h ${match[2].padStart(2, '0')}m`;
}

const CLASS_RANK: Record<string, number> = { VIP: 0, Business: 1, Normal: 2 };

export function adaptCity(raw: TravlerCity): City {
  return { id: toId(raw.city_id), name: raw.city_name.trim() };
}

export interface TripSearchContext {
  fromCityId: string;
  toCityId: string;
  from: string;
  to: string;
  date: string;
}

export function adaptTrip(raw: TravlerTrip, context: TripSearchContext): Trip {
  const prices = (raw.defaultTripPriceList ?? [])
    .map((entry) => ({ type: entry.seatType, amount: toNumber(entry.amount) }))
    .filter((entry): entry is { type: string; amount: number } => entry.amount !== null);

  const classes: BusClassOption[] = prices
    .map((entry) => ({ className: seatClassFor(entry.type), price: entry.amount }))
    .filter((entry): entry is BusClassOption => !!entry.className)
    .sort((a, b) => CLASS_RANK[a.className] - CLASS_RANK[b.className]);

  const lowest = prices.length > 0 ? Math.min(...prices.map((p) => p.amount)) : toNumber(raw.ticket_amount);
  const rating = toNumber(raw.avg_rating);
  const ratingCount = toNumber(raw.rating_count);

  return {
    id: toId(raw.bus_id),
    routeId: toId(raw.route_id),
    operator: raw.company_name?.trim() || 'Bus operator',
    operatorLogo: raw.company_logo?.trim() || undefined,
    fromCityId: context.fromCityId,
    toCityId: context.toCityId,
    from: context.from,
    to: context.to,
    date: raw.travel_date || context.date,
    departureTime: raw.departure_time,
    departureHour: parseHour(raw.departure_time),
    arrivalTime: raw.arrival_time,
    duration: formatJourneyTime(raw.total_journey_time ?? ''),
    busType: raw.bus_type?.trim() ?? '',
    seatsAvailable: toNumber(raw.available_seat_count) ?? 0,
    fromPrice: lowest ?? 0,
    classes,
    // Amenities come as bare ids ("1,2,3") and there's no endpoint to name
    // them yet, so none are shown rather than guessing.
    amenities: [],
    rating: rating ?? undefined,
    ratingCount: ratingCount ?? undefined,
    routeKind: raw.highWayDirectRoute?.trim() || undefined,
    isPromotional: !!raw.isPromotional,
  };
}

/** The seat layout response has its own shape: priceList and seatsBooked
 * sit at the top level beside the seats, and there's no `msg`. */
export function adaptSeatLayout(raw: TravlerSeatLayoutResponse): SeatLayout {
  const priceByType = new Map<string, number>();
  for (const [type, entries] of Object.entries(raw.priceList ?? {})) {
    const price = toNumber(entries?.[0]?.price);
    if (price !== null) {
      priceByType.set(type.trim().toLowerCase(), price);
    }
  }

  const positioned = (raw.data ?? []).map((seat) => ({
    seat,
    left: toNumber(seat.left) ?? 0,
    top: toNumber(seat.top) ?? 0,
    width: toNumber(seat.seat_width) ?? 36,
    height: toNumber(seat.seat_height) ?? 36,
  }));

  // Shift the layout so the first seat sits at 0,0; the raw offsets leave
  // empty room for the driver's area, which the seat map draws separately.
  const minLeft = positioned.length ? Math.min(...positioned.map((p) => p.left)) : 0;
  const minTop = positioned.length ? Math.min(...positioned.map((p) => p.top)) : 0;

  const seats: LayoutSeat[] = positioned.map(({ seat, left, top, width, height }) => {
    const type = seat.seat_type?.trim() ?? '';
    const price = priceByType.get(type.toLowerCase()) ?? null;
    return {
      id: toId(seat.seat_id),
      name: String(seat.seat_name).trim(),
      type,
      typeLabel: seatTypeLabel(type),
      className: seatClassFor(type),
      status: seat.selection_status === true ? 'taken' : 'available',
      price,
      left: left - minLeft,
      top: top - minTop,
      width,
      height,
    };
  });

  return {
    seats,
    width: seats.length ? Math.max(...seats.map((s) => s.left + s.width)) : 0,
    height: seats.length ? Math.max(...seats.map((s) => s.top + s.height)) : 0,
    bookedCount: toNumber(raw.seatsBooked) ?? seats.filter((s) => s.status === 'taken').length,
  };
}

function adaptPoint(raw: TravlerPoint): StopPoint {
  return { id: toId(raw.id), name: raw.name?.trim() ?? '', time: raw.time?.trim() ?? '' };
}

export function adaptPoints(raw: TravlerPoints | undefined): BoardingDroppingPoints {
  return {
    boarding: (raw?.boarding ?? []).map(adaptPoint),
    dropping: (raw?.dropping ?? []).map(adaptPoint),
  };
}

export function adaptBooking(raw: TravlerBooking, sentTotal: number): BookingHold {
  const expiresAt = raw.expires_at ? new Date(raw.expires_at) : null;
  const heldUntil =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? expiresAt
      : new Date(Date.now() + BOOKING_HOLD_MINUTES * 60_000);
  return {
    reference: toId(raw.booking_reference),
    status: raw.status ?? '',
    totalAmount: toNumber(raw.total_amount) ?? sentTotal,
    currency: raw.currency || 'KES',
    heldUntil: heldUntil.toISOString(),
  };
}

export function adaptPaymentStart(raw: TravlerPaymentInit): PaymentStart {
  return { reference: toId(raw.payment_reference), status: raw.status ?? '' };
}

const PAYMENT_SUCCESS = new Set(['success', 'successful', 'completed', 'paid', 'confirmed']);
const PAYMENT_REJECTED = new Set(['failed', 'failure', 'rejected', 'cancelled', 'canceled', 'declined', 'expired']);

export function paymentStateFor(status: string): PaymentState {
  const normalised = status.trim().toLowerCase();
  if (PAYMENT_SUCCESS.has(normalised)) {
    return 'success';
  }
  if (PAYMENT_REJECTED.has(normalised)) {
    return 'rejected';
  }
  return 'pending';
}

export function adaptPaymentStatus(raw: TravlerPaymentCheck): PaymentStatus {
  return {
    reference: toId(raw.payment_reference),
    state: paymentStateFor(raw.status ?? ''),
    ticketNumber: raw.ticketNumber ? toId(raw.ticketNumber) : undefined,
  };
}

export function adaptPrint(raw: TravlerPrint, ticketNumber: string): PrintableTicket {
  return { ticketNumber: toId(raw.ticket_number) || ticketNumber, url: raw.printable_url?.trim() ?? '' };
}
