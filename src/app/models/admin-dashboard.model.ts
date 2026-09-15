/** Shared visual tone for admin dashboard cards/rows. Maps to a tinted
 * background plus a matching icon/text color, reusing theme.css tokens:
 * red -> --color-accent, moss -> --color-green, gold -> --color-accent-dark,
 * navy -> --color-primary-light. */
export type DashboardTone = 'red' | 'moss' | 'gold' | 'navy';

/** "This week" summary numbers. The dashboard greeting shows one of these
 * (ticketsSold); summary-list renders the full set. */
export interface WeekSummary {
  ticketsSold: number;
  tripsCompleted: number;
  refundsIssued: number;
  seatsOpenToday: number;
  averageRating: number;
}

/** 'warning' is for a delta that isn't really a trend (e.g. "oldest 2 hours
 * ago" on the awaiting-payment KPI) but still needs the same red, urgent
 * treatment as a downward one. */
export type DeltaDirection = 'up' | 'down' | 'neutral' | 'warning';

export interface KpiDelta {
  direction: DeltaDirection;
  text: string;
}

export interface KpiCardData {
  label: string;
  value: string;
  delta: KpiDelta;
  tone: DashboardTone;
  /** Recent trend points for the inline sparkline, oldest first. */
  sparkline: number[];
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
  failedPayments: number;
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
