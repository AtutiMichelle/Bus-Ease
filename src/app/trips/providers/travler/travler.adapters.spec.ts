import { adaptCity, adaptPoints, adaptSeatLayout, adaptTrip, paymentStateFor, toId, toNumber } from './travler.adapters';
import { TravlerSeat, TravlerSeatLayoutResponse, TravlerTrip } from './travler.types';

const context = { fromCityId: '1', toCityId: '2', from: 'Nairobi', to: 'Mombasa', date: '2026-09-30' };

function rawTrip(overrides: Partial<TravlerTrip> = {}): TravlerTrip {
  return {
    bus_id: 15159,
    company_name: 'BUSCAR',
    company_id: '38',
    token: 'TRIP-DEMO-001',
    bus_type: '46 SEATER A',
    route_id: '1529',
    amenities: '1,2,3',
    departure_time: '09:00 PM',
    arrival_time: '03:20 AM',
    available_seat_count: 32,
    total_journey_time: '06:20',
    avg_rating: '4.4',
    rating_count: '118',
    multi_seat: false,
    defaultTripPriceList: [
      { currencyCode: 'KES', amount: '2000.00', seatType: 'vip' },
      { currencyCode: 'KES', amount: '1500.00', seatType: 'normal' },
    ],
    highWayDirectRoute: 'Direct',
    company_logo: 'https://example.invalid/buscar.png',
    isPromotional: false,
    travel_date: '2026-09-30',
    ...overrides,
  };
}

function rawSeat(overrides: Partial<TravlerSeat>): TravlerSeat {
  return {
    left: '102',
    top: '0',
    seat_id: '1',
    seat_width: '37',
    seat_height: '36',
    seat_name: '1',
    seat_type: 'normal',
    seat_type_id: '7786',
    selection_status: false,
    ...overrides,
  };
}

describe('travler adapters', () => {
  it('normalises ids and numbers', () => {
    expect(toId(15159)).toBe('15159');
    expect(toId(null)).toBe('');
    expect(toNumber('1,500.00')).toBe(1500);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('')).toBeNull();
  });

  it('turns a search result into a trip priced from the lowest fare', () => {
    const trip = adaptTrip(rawTrip(), context);
    expect(trip.id).toBe('15159');
    expect(trip.routeId).toBe('1529');
    expect(trip.fromPrice).toBe(1500);
    expect(trip.classes.map((c) => c.className)).toEqual(['VIP', 'Normal']);
    expect(trip.departureHour).toBe(21);
    expect(trip.duration).toBe('6h 20m');
    expect(trip.rating).toBe(4.4);
    expect(trip.ratingCount).toBe(118);
    expect(trip.from).toBe('Nairobi');
    expect(trip.delay).toEqual({ flag: 0, date: 0 });
  });

  it('works out the trip length from the times, not the reported journey time', () => {
    const overnight = adaptTrip(rawTrip({ departure_time: '10:00 PM', arrival_time: '06:45 AM', total_journey_time: '01:23' }), context);
    expect(overnight.duration).toBe('8h 45m');
    const sameDay = adaptTrip(rawTrip({ departure_time: '08:00 AM', arrival_time: '04:30 PM' }), context);
    expect(sameDay.duration).toBe('8h 30m');
    const unreadable = adaptTrip(rawTrip({ departure_time: 'soon', total_journey_time: '07:05' }), context);
    expect(unreadable.duration).toBe('7h 05m');
  });

  it('keeps the delay markers and falls back to the search date', () => {
    const trip = adaptTrip(rawTrip({ travel_date: undefined, delayedFlag: 0, delayedDate: 1792443600 }), context);
    expect(trip.date).toBe('2026-09-30');
    expect(trip.delay).toEqual({ flag: 0, date: 1792443600 });
  });

  it('reads city ids from the id field', () => {
    expect(adaptCity({ id: '3', city_name: ' NAIROBI ' })).toEqual({ id: '3', name: 'NAIROBI' });
  });

  it('reads stops from the top of the response, with boarding times', () => {
    const points = adaptPoints({
      isSuccess: true,
      boarding: [{ id: '4016', name: 'Accra Road, CoastBus booking office', departureTime: '09:30 PM' }],
      dropping: [{ id: '3068', name: 'Mwembe Tayari ' }],
    });
    expect(points.boarding).toEqual([{ id: '4016', name: 'Accra Road, CoastBus booking office', time: '09:30 PM' }]);
    expect(points.dropping).toEqual([{ id: '3068', name: 'Mwembe Tayari', time: '' }]);
  });

  it('reads the seat layout shape, prices seats by type and marks taken seats', () => {
    const raw: TravlerSeatLayoutResponse = {
      isSuccess: true,
      priceList: {
        normal: [{ currencyType: 'KES', currencyId: '1', price: '1700.00', tax: 0 }],
        vip: [{ currencyType: 'KES', currencyId: '1', price: '2200.00', tax: 0 }],
      },
      data: [
        rawSeat({ seat_id: 6679, seat_name: '1', left: '102', top: '252' }),
        rawSeat({ seat_id: '6683', seat_name: '5', left: '149', top: '252', selection_status: true }),
        rawSeat({ seat_id: '6690', seat_name: 'V1', left: '193', top: '0', seat_type: 'vip' }),
        rawSeat({ seat_id: '6700', seat_name: 'X', left: '240', top: '0', seat_type: 'sleeper' }),
      ],
      seatsBooked: '1',
    };
    const layout = adaptSeatLayout(raw);
    const [first, taken, vip, unpriced] = layout.seats;

    expect(first.id).toBe('6679');
    expect(first.price).toBe(1700);
    expect(first.status).toBe('available');
    expect(first.left).toBe(0);
    expect(first.top).toBe(252);
    expect(taken.status).toBe('taken');
    expect(vip.price).toBe(2200);
    expect(vip.className).toBe('VIP');
    expect(unpriced.price).toBeNull();
    expect(unpriced.typeLabel).toBe('Sleeper');
    expect(layout.bookedCount).toBe(1);
    expect(layout.width).toBe(240 - 102 + 37);
    expect(layout.height).toBe(252 + 36);
  });

  it('leaves the driver and door cells out of the seats', () => {
    const layout = adaptSeatLayout({
      isSuccess: true,
      priceList: { normal: [{ currencyType: 'KES', currencyId: '1', price: '1300.00', tax: 0 }] },
      data: [
        rawSeat({ seat_id: '14734', seat_name: 'Driver', seat_type: 'driver', left: '52', top: '15', selection_status: true }),
        rawSeat({ seat_id: '14735', seat_name: 'Door', seat_type: 'door', left: '28', top: '253', selection_status: true }),
        rawSeat({ seat_id: '14690', seat_name: 'A1', left: '159', top: '253' }),
      ],
      seatsBooked: 0,
    });
    expect(layout.seats.map((seat) => seat.name)).toEqual(['A1']);
    expect(layout.seats[0].left).toBe(0);
    expect(layout.seats[0].status).toBe('available');
  });

  it('maps payment statuses', () => {
    expect(paymentStateFor('success')).toBe('success');
    expect(paymentStateFor('FAILED')).toBe('rejected');
    expect(paymentStateFor('pending')).toBe('pending');
    expect(paymentStateFor('something-new')).toBe('pending');
  });
});
