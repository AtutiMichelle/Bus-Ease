import { Bus } from './bus.model';

export interface PassengerInput {
  seatNumber: string;
  fullName: string;
  mobile: string;
  age?: number;
  gender?: string;
  /** The seat's actual class price, as priced during seat selection. */
  price?: number;
}

export interface SavedBooking {
  reference: string;
  bus: Bus;
  seats: string[];
  total: number;
  bookedAt: string;
}

/** A seat picked on the seat map, priced from the seat layout. */
export interface SelectedSeat {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  className?: 'VIP' | 'Business' | 'Normal';
  price: number;
}

/** One traveller in a booking, tied to the seat they will sit in. */
export interface TripPassenger {
  seatName: string;
  seatType: string;
  fullName: string;
  idNumber: string;
  price: number;
}

export interface BookingContact {
  email: string;
  /** Normalised 2547XXXXXXXX / 2541XXXXXXXX form. */
  phone: string;
}
