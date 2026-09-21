import type { IconName } from '../admin/admin-nav';

/** Shared visual tone for admin dashboard cards/rows. Maps to a tinted
 * background plus a matching icon/text color from the admin tokens in
 * theme.css: red -> negative, moss -> positive, gold -> warning, navy -> info. */
export type DashboardTone = 'red' | 'moss' | 'gold' | 'navy';

/** Load state of one dashboard widget. Every widget loads on its own, so a
 * failed query only puts its own card into 'error'. */
export type WidgetState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** "This week" summary numbers, rendered by summary-list. A null value means the
 * database has nothing to measure it with yet (no refunds or ratings tables),
 * and the row shows "Not tracked yet" instead of a made-up number. */
export interface WeekSummary {
  ticketsSold: number;
  tripsCompleted: number;
  refundsIssued: number | null;
  seatsOpenToday: number;
  averageRating: number | null;
}

/** 'warning' is for a delta that isn't really a trend (the live "Oldest 2 min
 * ago" on the awaiting-payment KPI) but still needs an attention colour. */
export type DeltaDirection = 'up' | 'down' | 'neutral' | 'warning';

export interface KpiDelta {
  direction: DeltaDirection;
  /** Chip text, e.g. "12%", "New" or "Live". */
  text: string;
  /** Plain text beside the chip, e.g. "vs last week". */
  note?: string;
}

/** The window the four stat cards cover, chosen with the Performance control. */
export type KpiPeriod = 'today' | '7d' | '30d';

export interface KpiCardData {
  label: string;
  /** The number itself, e.g. "137" or "389k". */
  value: string;
  /** Small prefix shown before the number, e.g. "KSh". */
  unit?: string;
  delta: KpiDelta;
  tone: DashboardTone;
  icon: IconName;
}

export interface TopRoute {
  /** Short airport-style code for the badge, e.g. "MSA". */
  code: string;
  name: string;
  ticketCount: number;
  revenue: number;
  delta: KpiDelta;
  /** The single top route is 'red' (the brand's primary-series color);
   * every other row is 'navy'. Decided in the service, not the component,
   * since it depends on the whole ranked list. */
  tone: DashboardTone;
}

export interface TopRoutesData {
  routes: TopRoute[];
  /** Routes that ran this week but sold nothing, named in the card's muted
   * footer rather than silently omitted. */
  noSalesRoutes: string[];
}

export interface PaymentSplitSlice {
  label: string;
  amount: number;
  percent: number;
  tone: DashboardTone;
}

export interface PaymentSplitData {
  totalCollected: number;
  slices: PaymentSplitSlice[];
  /** Null until payment attempts are recorded (there is no payments table
   * yet), shown as "Not tracked yet". */
  failedPayments: number | null;
}

export type BookingStatusTag = 'Paid' | 'Unpaid' | 'Refunded';

export interface RecentBooking {
  reference: string;
  customerName: string;
  customerInitials: string;
  bookedAt: string;
  route: string;
  amount: number;
  status: BookingStatusTag;
}

export type DepartureStatus = 'Departed' | 'Boarding' | 'Scheduled' | 'Delayed';

export interface Departure {
  time: string;
  route: string;
  seatsSold: number;
  totalSeats: number;
  status: DepartureStatus;
}
