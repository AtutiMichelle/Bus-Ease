import { Bus, BusClassOption } from './bus.model';

export type BusType = Bus['busType'];

export const BUS_TYPE_OPTIONS: BusType[] = ['Luxury', 'Standard', 'Express'];

export const SEAT_CLASS_NAMES: BusClassOption['className'][] = ['VIP', 'Business', 'Normal'];

/** Matches the bus_amenities check constraint in
 * supabase/sql/2026-08-28-bus-amenities.sql. */
export const AMENITY_OPTIONS = [
  'Air Conditioning',
  'Dvd Player',
  'Wifi',
  'Phone Charging',
  'GPS Tracking',
  'Water',
  'Newspaper',
  'Tea',
] as const;

export type Amenity = (typeof AMENITY_OPTIONS)[number];

export interface AdminRoute {
  id: string;
  origin: string;
  destination: string;
  durationMinutes: number;
  tripCount: number;
}

export interface RouteFormValue {
  origin: string;
  destination: string;
  durationMinutes: number;
}

export interface AdminOperator {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface TripSeatClass {
  className: BusClassOption['className'];
  price: number;
}

export type TripStatus = 'departed' | 'boarding' | 'scheduled';

export interface AdminTrip {
  id: string;
  routeId: string;
  origin: string;
  destination: string;
  operatorId: string;
  operatorName: string;
  operatorLogo: string | null;
  busType: BusType;
  basePrice: number;
  /** Local (Africa/Nairobi) wall-clock timestamps, as stored — see the note
   * in 2026-09-21-admin-dashboard.sql. */
  departureTime: string;
  arrivalTime: string;
  totalSeats: number;
  availableSeats: number;
  classes: TripSeatClass[];
  amenities: string[];
}

/** Fields shared by create and edit. Create additionally sets the seat
 * layout (rows + classes), which cannot change once a trip exists. */
export interface TripFormBase {
  routeId: string;
  operatorId: string | null;
  newOperatorName: string | null;
  busType: BusType;
  /** "YYYY-MM-DDTHH:mm" from a datetime-local input, sent as-is: the column
   * is a plain timestamp holding Nairobi wall-clock time already. */
  departureTime: string;
  arrivalTime: string;
  basePrice: number;
  amenities: string[];
}

export interface TripCreateValue extends TripFormBase {
  rows: number;
  classes: TripSeatClass[];
}

export type TripUpdateValue = TripFormBase;
