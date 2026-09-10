export type BookingStatus = 'confirmed' | 'completed' | 'cancelled';

export interface AccountBooking {
  reference: string;
  from: string;
  to: string;
  date: string;
  time: string;
  seats: string[];
  fare: number;
  status: BookingStatus;
}

export interface EmergencyContact {
  contactName: string;
  contactPhone: string;
}

export interface NotificationSettings {
  bookingConfirmations: boolean;
  tripReminders: boolean;
  promotions: boolean;
}
