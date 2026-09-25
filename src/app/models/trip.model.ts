import { BusClassOption } from './bus.model';

/** Seat classes the app knows how to label and colour. Anything else the
 * booking API sends still works, it just shows without a class colour. */
export type SeatClassName = BusClassOption['className'];

export interface City {
  id: string;
  name: string;
}

/** One bookable departure from a trip search. */
export interface Trip {
  /** The bus id; unique within one search. */
  id: string;
  routeId: string;
  operator: string;
  operatorLogo?: string;
  fromCityId: string;
  toCityId: string;
  from: string;
  to: string;
  /** yyyy-mm-dd */
  date: string;
  departureTime: string;
  /** Raw 24-hour departure hour (0-23), for filtering by time-of-day bucket. */
  departureHour: number;
  arrivalTime: string;
  duration: string;
  busType: string;
  seatsAvailable: number;
  /** Lowest search fare. The real per-seat price comes from the seat layout. */
  fromPrice: number;
  classes: BusClassOption[];
  amenities: string[];
  rating?: number;
  ratingCount?: number;
  /** e.g. "Direct" or "Highway". */
  routeKind?: string;
  isPromotional: boolean;
}

export interface LayoutSeat {
  id: string;
  /** Printed seat label, and the value the booking request sends as seat_number. */
  name: string;
  /** The API's own seat type key (e.g. "normal", "vip"), sent back when booking. */
  type: string;
  typeLabel: string;
  className?: SeatClassName;
  status: 'available' | 'taken';
  /** Null when the layout has no price for this seat's type. */
  price: number | null;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SeatLayout {
  seats: LayoutSeat[];
  /** Bounding box of every seat, in the layout's own units. */
  width: number;
  height: number;
  bookedCount: number;
}

export interface StopPoint {
  id: string;
  name: string;
  time: string;
}

export interface BoardingDroppingPoints {
  boarding: StopPoint[];
  dropping: StopPoint[];
}

export interface BookingHold {
  reference: string;
  status: string;
  totalAmount: number;
  currency: string;
  /** ISO timestamp when the unpaid hold lapses. */
  heldUntil: string;
}

export interface PaymentStart {
  reference: string;
  status: string;
}

export type PaymentState = 'pending' | 'success' | 'rejected';

export interface PaymentStatus {
  reference: string;
  state: PaymentState;
  ticketNumber?: string;
}

export interface PrintableTicket {
  ticketNumber: string;
  url: string;
}
