export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  joinedAt: string;
  totalBookings: number;
  totalSpent: number;
  lastBookingAt: string | null;
}
