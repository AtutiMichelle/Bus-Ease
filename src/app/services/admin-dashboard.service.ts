import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import {
  BookingStatusTag,
  Departure,
  DepartureStatus,
  KpiCardData,
  KpiDelta,
  PaymentSplitData,
  PaymentSplitSlice,
  RecentBooking,
  TopRoute,
  TopRoutesData,
  WeekSummary,
} from '../models/admin-dashboard.model';
import { formatKsh, formatKshCompact } from '../utils/money';

/** Raw shapes returned by the admin_* database functions (see
 * supabase/sql/2026-09-21-admin-dashboard.sql). Numbers can arrive as
 * strings when Postgres numeric values are large, so they are always run
 * through Number() when mapped. */
interface MetricRow {
  current: number | string;
  previous: number | string;
  daily: (number | string)[] | null;
}

interface KpiCardsRow {
  days: string[] | null;
  tickets: MetricRow;
  revenue: MetricRow;
  new_customers: MetricRow;
  awaiting: { count: number; oldest_minutes: number | null };
}

interface WeekSummaryRow {
  tickets_sold: number;
  trips_completed: number;
  seats_open_today: number;
}

interface TopRoutesRow {
  routes: {
    route_id: string;
    origin: string;
    destination: string;
    tickets: number;
    revenue: number | string;
    previous_tickets: number;
    previous_revenue: number | string;
  }[];
  no_sales: { origin: string; destination: string }[];
}

interface PaymentSplitRow {
  total_collected: number | string;
  slices: { method: string; amount: number | string }[];
}

interface RecentBookingRow {
  reference: string;
  amount: number | string;
  status: string;
  booked_at: string;
  origin: string;
  destination: string;
  customer_name: string | null;
}

interface DepartureRow {
  bus_id: string;
  time: string;
  origin: string;
  destination: string;
  total_seats: number;
  seats_booked: number;
  status: 'departed' | 'boarding' | 'scheduled';
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mpesa: 'M-Pesa',
  'm-pesa': 'M-Pesa',
  card: 'Card',
  wallet: 'BusEase wallet',
  unrecorded: 'Not recorded',
};

const DEPARTURE_STATUS: Record<DepartureRow['status'], DepartureStatus> = {
  departed: 'Departed',
  boarding: 'Boarding',
  scheduled: 'Scheduled',
};

function routeName(origin: string, destination: string): string {
  return `${origin} → ${destination}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Change vs the previous 7 days, e.g. "12% vs last week". */
function weekOverWeek(current: number, previous: number): KpiDelta {
  if (previous === 0 && current === 0) {
    return { direction: 'neutral', text: 'No change vs last week' };
  }
  if (previous === 0) {
    return { direction: 'up', text: 'From zero last week' };
  }
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (percent === 0) {
    return { direction: 'neutral', text: 'No change vs last week' };
  }
  return { direction: current > previous ? 'up' : 'down', text: `${percent}% vs last week` };
}

/** Compact version for the per-route badge, e.g. "14%". */
function routeDelta(current: number, previous: number): KpiDelta {
  if (previous === 0) {
    return { direction: 'up', text: 'New' };
  }
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (percent === 0) {
    return { direction: 'neutral', text: '0%' };
  }
  return { direction: current > previous ? 'up' : 'down', text: `${percent}%` };
}

/** Whole percentages that always add up to 100 (largest remainder method),
 * so the legend never shows 80 + 14 + 5 = 99. */
function percentagesOf(amounts: number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total <= 0) {
    return amounts.map(() => 0);
  }
  const exact = amounts.map((amount) => (amount / total) * 100);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (remaining <= 0) {
      break;
    }
    floors[index] += 1;
    remaining -= 1;
  }
  return floors;
}

function bookingStatus(status: string): BookingStatusTag {
  switch (status.toLowerCase()) {
    case 'confirmed':
    case 'paid':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Unpaid';
  }
}

function ticketLabel(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'ticket' : 'tickets'}`;
}

function toNumbers(values: (number | string)[] | null | undefined): number[] {
  return (values ?? []).map(Number);
}

/** Admin dashboard data. Each method makes one call to an admin-only
 * database function that does the aggregation server-side (and refuses to
 * run for non-admins), then maps the raw row into the shape the widget
 * renders. Methods throw on failure so each widget can show its own error
 * state. */
@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private client = inject(Supabase).getClient();

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) {
      throw error;
    }
    return data as T;
  }

  async getWeekSummary(): Promise<WeekSummary> {
    const row = await this.rpc<WeekSummaryRow>('admin_week_summary');
    return {
      ticketsSold: Number(row.tickets_sold),
      tripsCompleted: Number(row.trips_completed),
      seatsOpenToday: Number(row.seats_open_today),
      // No refunds or ratings tables exist yet, so there is nothing to count.
      refundsIssued: null,
      averageRating: null,
    };
  }

  async getKpiCards(): Promise<KpiCardData[]> {
    const row = await this.rpc<KpiCardsRow>('admin_kpi_cards');
    const days = row.days ?? [];

    const tickets = { current: Number(row.tickets.current), previous: Number(row.tickets.previous) };
    const revenue = { current: Number(row.revenue.current), previous: Number(row.revenue.previous) };
    const customers = { current: Number(row.new_customers.current), previous: Number(row.new_customers.previous) };
    const awaiting = row.awaiting;
    const ticketsDaily = toNumbers(row.tickets.daily);
    const revenueDaily = toNumbers(row.revenue.daily);
    const customersDaily = toNumbers(row.new_customers.daily);

    let awaitingDelta: KpiDelta;
    if (awaiting.count === 0) {
      awaitingDelta = { direction: 'neutral', text: 'Nobody is paying right now' };
    } else if (awaiting.oldest_minutes === null || awaiting.oldest_minutes < 1) {
      awaitingDelta = { direction: 'warning', text: 'Oldest just started' };
    } else {
      awaitingDelta = { direction: 'warning', text: `Oldest ${awaiting.oldest_minutes} min ago` };
    }

    return [
      {
        label: 'Tickets sold',
        value: tickets.current.toLocaleString('en-US'),
        delta: weekOverWeek(tickets.current, tickets.previous),
        tone: 'red',
        sparkline: ticketsDaily,
        sparklineDays: days,
        sparklineLabels: ticketsDaily.map(ticketLabel),
      },
      {
        label: 'Revenue',
        value: formatKshCompact(revenue.current),
        delta: weekOverWeek(revenue.current, revenue.previous),
        tone: 'moss',
        sparkline: revenueDaily,
        sparklineDays: days,
        sparklineLabels: revenueDaily.map(formatKsh),
      },
      {
        label: 'Awaiting payment',
        value: awaiting.count.toLocaleString('en-US'),
        delta: awaitingDelta,
        tone: 'gold',
        sparkline: [],
        sparklineDays: [],
        sparklineLabels: [],
        sparklineNote: 'Live count, no history kept',
      },
      {
        label: 'New customers',
        value: customers.current.toLocaleString('en-US'),
        delta: weekOverWeek(customers.current, customers.previous),
        tone: 'navy',
        sparkline: customersDaily,
        sparklineDays: days,
        sparklineLabels: customersDaily.map((count) => `${count.toLocaleString('en-US')} new`),
      },
    ];
  }

  async getTopRoutes(limit = 4): Promise<TopRoutesData> {
    const row = await this.rpc<TopRoutesRow>('admin_top_routes', { p_limit: limit });
    const routes: TopRoute[] = row.routes.map((route, index) => ({
      code: route.destination.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
      name: routeName(route.origin, route.destination),
      ticketCount: Number(route.tickets),
      revenue: Number(route.revenue),
      delta: routeDelta(Number(route.tickets), Number(route.previous_tickets)),
      tone: index === 0 ? 'red' : 'navy',
    }));
    return {
      routes,
      noSalesRoutes: row.no_sales.map((route) => routeName(route.origin, route.destination)),
    };
  }

  async getPaymentSplit(): Promise<PaymentSplitData> {
    const row = await this.rpc<PaymentSplitRow>('admin_payment_split');
    const amounts = row.slices.map((slice) => Number(slice.amount));
    const percents = percentagesOf(amounts);
    const slices: PaymentSplitSlice[] = row.slices.map((slice, index) => ({
      label: PAYMENT_METHOD_LABELS[slice.method] ?? slice.method.charAt(0).toUpperCase() + slice.method.slice(1),
      amount: amounts[index],
      percent: percents[index],
      tone: index === 0 ? 'red' : 'navy',
    }));
    return {
      totalCollected: Number(row.total_collected),
      slices,
      // Failed attempts are not recorded anywhere yet (no payments table).
      failedPayments: null,
    };
  }

  async getRecentBookings(limit = 6): Promise<RecentBooking[]> {
    const rows = await this.rpc<RecentBookingRow[]>('admin_recent_bookings', { p_limit: limit });
    return rows.map((row) => {
      const customerName = row.customer_name?.trim() || 'Guest';
      return {
        reference: row.reference,
        customerName,
        customerInitials: initials(customerName),
        bookedAt: row.booked_at,
        route: routeName(row.origin, row.destination),
        amount: Number(row.amount),
        status: bookingStatus(row.status),
      };
    });
  }

  async getDeparturesToday(): Promise<Departure[]> {
    const rows = await this.rpc<DepartureRow[]>('admin_departures_today');
    return rows.map((row) => ({
      time: row.time,
      route: routeName(row.origin, row.destination),
      seatsSold: Number(row.seats_booked),
      totalSeats: Number(row.total_seats),
      status: DEPARTURE_STATUS[row.status] ?? 'Scheduled',
    }));
  }
}
