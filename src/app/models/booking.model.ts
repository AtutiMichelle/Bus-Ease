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
