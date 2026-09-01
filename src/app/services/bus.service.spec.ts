import { mapBusRow, BusRow, mapSeatRow, SeatRow } from './bus.service';

function makeRow(overrides: Partial<BusRow> = {}): BusRow {
  return {
    id: '1',
    operators: { name: 'Coast Bus', logo_url: null },
    bus_type: 'Luxury',
    base_price: '1800',
    departure_time: '2026-08-27T06:30:00Z',
    arrival_time: '2026-08-27T13:00:00Z',
    total_seats: 44,
    available_seats: 40,
    routes: { origin: 'Nairobi', destination: 'Mombasa', duration_minutes: 390 },
    bus_classes: [],
    bus_amenities: [],
    ...overrides,
  };
}

describe('mapBusRow amenities', () => {
  it('maps bus_amenities rows into a flat list of amenity names', () => {
    const row = makeRow({
      bus_amenities: [{ amenity: 'Wifi' }, { amenity: 'Water' }],
    });

    expect(mapBusRow(row).amenities).toEqual(['Wifi', 'Water']);
  });

  it('returns an empty array when bus_amenities is empty or missing', () => {
    expect(mapBusRow(makeRow({ bus_amenities: [] })).amenities).toEqual([]);
    expect(mapBusRow(makeRow({ bus_amenities: undefined })).amenities).toEqual([]);
  });
});

describe('mapBusRow classes', () => {
  it('maps bus_classes rows into classes, sorted VIP, Business, Normal', () => {
    const row = makeRow({
      bus_classes: [
        { class_name: 'Normal', price: '1800' },
        { class_name: 'VIP', price: '4200' },
        { class_name: 'Business', price: '3600' },
      ],
    });

    const bus = mapBusRow(row);

    expect(bus.classes).toEqual([
      { className: 'VIP', price: 4200 },
      { className: 'Business', price: 3600 },
      { className: 'Normal', price: 1800 },
    ]);
  });

  it('omits classes the bus does not offer, without inserting placeholders', () => {
    const row = makeRow({ bus_classes: [{ class_name: 'Normal', price: '2000' }] });

    expect(mapBusRow(row).classes).toEqual([{ className: 'Normal', price: 2000 }]);
  });

  it('returns an empty array when bus_classes is empty', () => {
    const row = makeRow({ bus_classes: [] });

    expect(mapBusRow(row).classes).toEqual([]);
  });
});

describe('mapSeatRow', () => {
  it('maps a seat with a class embed to className and price', () => {
    const row: SeatRow = {
      id: 's1',
      seat_number: '3B',
      status: 'available',
      bus_classes: { class_name: 'VIP', price: '4200' },
    };

    expect(mapSeatRow(row)).toEqual({
      id: 's1',
      number: '3B',
      status: 'available',
      className: 'VIP',
      price: 4200,
    });
  });

  it('maps a booked seat status correctly', () => {
    const row: SeatRow = {
      id: 's2',
      seat_number: '1A',
      status: 'booked',
      bus_classes: { class_name: 'Normal', price: '1800' },
    };

    expect(mapSeatRow(row).status).toBe('booked');
  });

  it('leaves className and price undefined when a seat has no class embed', () => {
    const row: SeatRow = {
      id: 's3',
      seat_number: '5A',
      status: 'available',
      bus_classes: null,
    };

    const seat = mapSeatRow(row);
    expect(seat.className).toBeUndefined();
    expect(seat.price).toBeUndefined();
  });
});
