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
  tickets: { current: 137, previous: 122 },
  revenue: { current: 389000, previous: 360500 },
  new_customers: { current: 0, previous: 0 },
  awaiting: { count: 3, oldest_minutes: 11 },
};

describe('AdminDashboardService', () => {
  it('builds stat cards with the change against the previous period', async () => {
    const { service, calls } = setup({ admin_kpi_summary: KPI_ROW });
    const [tickets, revenue, awaiting, customers] = await service.getKpiCards();

    expect(calls[0]).toEqual({ fn: 'admin_kpi_summary', args: { p_period: '7d' } });

    expect(tickets).toMatchObject({ label: 'Tickets sold', value: '137', icon: 'ticket' });
    expect(tickets.delta).toEqual({ direction: 'up', text: '12%', note: 'vs last week' });

    expect(revenue).toMatchObject({ unit: 'KSh', value: '389k' });
    expect(revenue.delta).toEqual({ direction: 'up', text: '8%', note: 'vs last week' });

    expect(awaiting.value).toBe('3');
    expect(awaiting.delta).toEqual({ direction: 'warning', text: 'Live', note: 'Oldest 11 min ago' });

    expect(customers.delta).toEqual({ direction: 'neutral', text: '0%', note: 'vs last week' });
  });

  it('asks the database for the chosen period and words the comparison to match', async () => {
    const { service, calls } = setup({ admin_kpi_summary: KPI_ROW });

    const [today] = await service.getKpiCards('today');
    const [thirty] = await service.getKpiCards('30d');

    expect(calls.map((call) => call.args)).toEqual([{ p_period: 'today' }, { p_period: '30d' }]);
    expect(today.delta.note).toBe('vs yesterday');
    expect(thirty.delta.note).toBe('vs previous 30 days');
  });

  it('shows zero values normally, as a drop when there was activity before', async () => {
    const row = { ...KPI_ROW, tickets: { current: 0, previous: 4 }, revenue: { current: 0, previous: 3520 } };
    const { service } = setup({ admin_kpi_summary: row });
    const [tickets, revenue] = await service.getKpiCards();

    expect(tickets.value).toBe('0');
    expect(tickets.delta).toEqual({ direction: 'down', text: '100%', note: 'vs last week' });
    expect(revenue).toMatchObject({ unit: 'KSh', value: '0' });
  });

  it('says so when there was nothing in the previous period to compare with', async () => {
    const row = { ...KPI_ROW, new_customers: { current: 1, previous: 0 } };
    const { service } = setup({ admin_kpi_summary: row });
    const [, , , customers] = await service.getKpiCards();
    expect(customers.delta).toEqual({ direction: 'up', text: 'New', note: 'From zero last week' });
  });

  it('describes the live awaiting-payment count without comparing it to anything', async () => {
    const idle = setup({ admin_kpi_summary: { ...KPI_ROW, awaiting: { count: 0, oldest_minutes: null } } });
    const [, , idleCard] = await idle.service.getKpiCards();
    expect(idleCard.delta).toEqual({ direction: 'neutral', text: 'Live', note: 'Nobody is paying right now' });
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

  it('maps departures with seats booked out of total, and passes the true total through', async () => {
    const { service, calls } = setup({
      admin_departures_summary: {
        total: 12,
        rows: [
          { bus_id: '2', time: '09:30', origin: 'Nairobi', destination: 'Kisumu', total_seats: 41, seats_booked: 28, status: 'boarding' },
          { bus_id: '1', time: '06:30', origin: 'Nairobi', destination: 'Mombasa', total_seats: 41, seats_booked: 38, status: 'departed' },
        ],
      },
    });
    const { total, departures } = await service.getDeparturesToday();

    expect(calls[0]).toEqual({ fn: 'admin_departures_summary', args: { p_limit: 5 } });
    expect(total).toBe(12);
    expect(departures[0]).toEqual({ time: '09:30', route: 'Nairobi → Kisumu', seatsSold: 28, totalSeats: 41, status: 'Boarding' });
    expect(departures[1]).toEqual({ time: '06:30', route: 'Nairobi → Mombasa', seatsSold: 38, totalSeats: 41, status: 'Departed' });
  });

  it('throws when the database call fails, so the widget can show its error state', async () => {
    const { service } = setup({}, ['admin_top_routes']);
    await expect(service.getTopRoutes()).rejects.toMatchObject({ message: 'boom' });
  });
});
