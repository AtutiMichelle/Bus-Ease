import { TestBed } from '@angular/core/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { Supabase } from './supabase';

/** Answers each admin_* database function with the given payload, or fails
 * it, so the service's mapping can be checked without a database. */
function setup(responses: Record<string, unknown>, failing: string[] = []) {
  const calls: { fn: string; args?: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      if (failing.includes(fn)) {
        return { data: null, error: { message: 'boom' } };
      }
      return { data: responses[fn], error: null };
    },
  };
  TestBed.configureTestingModule({
    providers: [{ provide: Supabase, useValue: { getClient: () => client } }],
  });
  return { service: TestBed.inject(AdminDashboardService), calls };
}

const KPI_ROW = {
  days: ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'],
  tickets: { current: 137, previous: 122, daily: [14, 19, 17, 22, 18, 25, 22] },
  revenue: { current: 389000, previous: 360500, daily: [48000, 61000, 55000, 72500, 52000, 58500, 42000] },
  new_customers: { current: 0, previous: 0, daily: [0, 0, 0, 0, 0, 0, 0] },
  awaiting: { count: 3, oldest_minutes: 11 },
};

describe('AdminDashboardService', () => {
  it('builds stat cards with week-over-week change and daily series', async () => {
    const { service } = setup({ admin_kpi_cards: KPI_ROW });
    const [tickets, revenue, awaiting, customers] = await service.getKpiCards();

    expect(tickets.value).toBe('137');
    expect(tickets.delta).toEqual({ direction: 'up', text: '12% vs last week' });
    expect(tickets.sparkline).toEqual([14, 19, 17, 22, 18, 25, 22]);
    expect(tickets.sparklineLabels[0]).toBe('14 tickets');

    expect(revenue.value).toBe('KSh 389k');
    expect(revenue.sparklineLabels[1]).toBe('KSh 61,000');

    expect(awaiting.value).toBe('3');
    expect(awaiting.delta).toEqual({ direction: 'warning', text: 'Oldest 11 min ago' });
    expect(awaiting.sparkline).toEqual([]);

    expect(customers.delta).toEqual({ direction: 'neutral', text: 'No change vs last week' });
  });

  it('says so when there was nothing last week to compare with', async () => {
    const row = { ...KPI_ROW, tickets: { current: 5, previous: 0, daily: [0, 0, 0, 0, 0, 2, 3] } };
    const { service } = setup({ admin_kpi_cards: row });
    const [tickets] = await service.getKpiCards();
    expect(tickets.delta).toEqual({ direction: 'up', text: 'From zero last week' });
  });

  it('marks refunds and ratings as untracked instead of inventing numbers', async () => {
    const { service } = setup({ admin_week_summary: { tickets_sold: 4, trips_completed: 2, seats_open_today: 3 } });
    const summary = await service.getWeekSummary();
    expect(summary).toEqual({
      ticketsSold: 4,
      tripsCompleted: 2,
      seatsOpenToday: 3,
      refundsIssued: null,
      averageRating: null,
    });
  });

  it('ranks routes, flags the top one, and lists routes with no sales', async () => {
    const { service } = setup({
      admin_top_routes: {
        routes: [
          { route_id: 'a', origin: 'Nairobi', destination: 'Mombasa', tickets: 62, revenue: '175200', previous_tickets: 54, previous_revenue: 1 },
          { route_id: 'b', origin: 'Mombasa', destination: 'Malindi', tickets: 18, revenue: 41800, previous_tickets: 0, previous_revenue: 0 },
        ],
        no_sales: [{ origin: 'Nairobi', destination: 'Kampala' }],
      },
    });
    const data = await service.getTopRoutes();

    expect(data.routes[0]).toMatchObject({ code: 'MOM', name: 'Nairobi → Mombasa', revenue: 175200, tone: 'red' });
    expect(data.routes[0].delta).toEqual({ direction: 'up', text: '15%' });
    expect(data.routes[1]).toMatchObject({ tone: 'navy' });
    expect(data.routes[1].delta).toEqual({ direction: 'up', text: 'New' });
    expect(data.noSalesRoutes).toEqual(['Nairobi → Kampala']);
  });

  it('turns payment amounts into whole percentages that add up to 100', async () => {
    const { service } = setup({
      admin_payment_split: {
        total_collected: 300,
        slices: [
          { method: 'mpesa', amount: 100 },
          { method: 'card', amount: 100 },
          { method: 'wallet', amount: 100 },
        ],
      },
    });
    const split = await service.getPaymentSplit();
    expect(split.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
    expect(split.slices.map((slice) => slice.label)).toEqual(['M-Pesa', 'Card', 'BusEase wallet']);
    expect(split.failedPayments).toBeNull();
  });

  it('labels bookings with no recorded payment method honestly', async () => {
    const { service } = setup({
      admin_payment_split: { total_collected: 900, slices: [{ method: 'unrecorded', amount: 900 }] },
    });
    const split = await service.getPaymentSplit();
    expect(split.slices[0]).toMatchObject({ label: 'Not recorded', percent: 100 });
  });

  it('maps recent bookings, using Guest when there is no name', async () => {
    const { service, calls } = setup({
      admin_recent_bookings: [
        { reference: 'K7M2QX4P', amount: '3520', status: 'confirmed', booked_at: '2026-09-21T05:26:00Z', origin: 'Nairobi', destination: 'Mombasa', customer_name: 'Wanjiku Kamau' },
        { reference: 'P8VR5CWD', amount: 1800, status: 'pending', booked_at: '2026-09-21T04:20:00Z', origin: 'Nairobi', destination: 'Eldoret', customer_name: null },
      ],
    });
    const bookings = await service.getRecentBookings(2);

    expect(calls[0]).toEqual({ fn: 'admin_recent_bookings', args: { p_limit: 2 } });
    expect(bookings[0]).toMatchObject({ customerName: 'Wanjiku Kamau', customerInitials: 'WK', amount: 3520, status: 'Paid' });
    expect(bookings[1]).toMatchObject({ customerName: 'Guest', customerInitials: 'G', status: 'Unpaid' });
  });

  it('maps departures with seats booked out of total', async () => {
    const { service } = setup({
      admin_departures_today: [
        { bus_id: '1', time: '06:30', origin: 'Nairobi', destination: 'Mombasa', total_seats: 41, seats_booked: 38, status: 'departed' },
        { bus_id: '2', time: '09:30', origin: 'Nairobi', destination: 'Kisumu', total_seats: 41, seats_booked: 28, status: 'boarding' },
      ],
    });
    const departures = await service.getDeparturesToday();
    expect(departures[0]).toEqual({ time: '06:30', route: 'Nairobi → Mombasa', seatsSold: 38, totalSeats: 41, status: 'Departed' });
    expect(departures[1].status).toBe('Boarding');
  });

  it('throws when the database call fails, so the widget can show its error state', async () => {
    const { service } = setup({}, ['admin_top_routes']);
    await expect(service.getTopRoutes()).rejects.toMatchObject({ message: 'boom' });
  });
});
