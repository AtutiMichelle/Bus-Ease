import { mapBusRow, BusRow } from './bus.service';

function makeRow(overrides: Partial<BusRow> = {}): BusRow {
  return {
    id: '1',
    operator: 'Coast Bus',
    bus_type: 'Luxury',
    base_price: '1800',
    departure_time: '2026-08-27T06:30:00Z',
    arrival_time: '2026-08-27T13:00:00Z',
    total_seats: 44,
    available_seats: 40,
    routes: { origin: 'Nairobi', destination: 'Mombasa', duration_minutes: 390 },
    bus_classes: [],
    ...overrides,
  };
}

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
