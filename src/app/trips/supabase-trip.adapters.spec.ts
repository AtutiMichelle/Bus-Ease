import { Bus } from '../models/bus.model';
import { Seat } from '../services/bus.service';
import { seatLayoutFromSeats, tripFromBus } from './supabase-trip.adapters';

const context = { fromCityId: 'Nairobi', toCityId: 'Mombasa', from: 'Nairobi', to: 'Mombasa', date: '2026-10-10' };

function bus(overrides: Partial<Bus> = {}): Bus {
  return {
    id: 'bus-uuid',
    operator: 'Modern Coast',
    from: 'Nairobi',
    to: 'Mombasa',
    date: '2026-10-10',
    departureTime: '08:00 AM',
    departureHour: 8,
    arrivalTime: '02:00 PM',
    duration: '6h 00m',
    busType: 'Luxury',
    price: 1500,
    seatsAvailable: 30,
    totalSeats: 41,
    classes: [
      { className: 'VIP', price: 2500 },
      { className: 'Normal', price: 1800 },
    ],
    amenities: ['wifi'],
    ...overrides,
  };
}

function seat(number: string, overrides: Partial<Seat> = {}): Seat {
  return { id: `id-${number}`, number, status: 'available', className: 'Normal', price: 1800, ...overrides };
}

describe('supabase trip adapters', () => {
  it('turns a bus into a trip priced from its cheapest class', () => {
    const trip = tripFromBus(bus(), context);
    expect(trip.id).toBe('bus-uuid');
    expect(trip.fromCityId).toBe('Nairobi');
    expect(trip.fromPrice).toBe(1800);
    expect(trip.classes.map((c) => c.className)).toEqual(['VIP', 'Normal']);
  });

  it('falls back to the base price when a bus has no classes', () => {
    expect(tripFromBus(bus({ classes: [] }), context).fromPrice).toBe(1500);
  });

  it('places seats in rows, front row first, either side of the aisle', () => {
    const layout = seatLayoutFromSeats([seat('2A'), seat('1B'), seat('1A'), seat('1D'), seat('1C')], 1500);
    const at = (name: string) => layout.seats.find((s) => s.name === name)!;
    expect([at('1A').left, at('1B').left, at('1C').left, at('1D').left]).toEqual([0, 44, 132, 176]);
    expect(at('1A').top).toBe(0);
    expect(at('2A').top).toBe(44);
  });

  it('comes out taller than wide for a full bus, so the seat map keeps it upright', () => {
    const seats = Array.from({ length: 10 }, (_, row) => ['A', 'B', 'C', 'D'].map((c) => seat(`${row + 1}${c}`))).flat();
    const layout = seatLayoutFromSeats(seats, 1500);
    expect(layout.height).toBeGreaterThan(layout.width);
  });

  it('puts the odd seat on a back bench in the aisle', () => {
    const layout = seatLayoutFromSeats(['A', 'B', 'C', 'D', 'E'].map((c) => seat(`10${c}`)), 1500);
    expect(layout.seats.find((s) => s.name === '10E')!.left).toBe(88);
  });

  it('maps class, status and price the way confirm_booking charges', () => {
    const layout = seatLayoutFromSeats(
      [
        seat('1A', { className: 'VIP', price: 2500, status: 'booked' }),
        seat('1B', { className: undefined, price: undefined }),
      ],
      1500,
    );
    const [vip, plain] = layout.seats;
    expect(vip).toMatchObject({ type: 'vip', typeLabel: 'VIP', status: 'taken', price: 2500 });
    expect(plain).toMatchObject({ type: '', typeLabel: 'Seat', status: 'available', price: 1500 });
    expect(layout.bookedCount).toBe(1);
  });
});
