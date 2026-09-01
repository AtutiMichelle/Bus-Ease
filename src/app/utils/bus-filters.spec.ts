import { Bus } from '../models/bus.model';
import { departureBucket, toSliderHour, matchesFilters, filterOptions, emptyFilterState, FilterState } from './bus-filters';

function makeBus(overrides: Partial<Bus> = {}): Bus {
  return {
    id: '1',
    operator: 'Coast Bus',
    from: 'Nairobi',
    to: 'Mombasa',
    date: '2026-08-27',
    departureTime: '6:30 AM',
    departureHour: 6,
    arrivalTime: '1:00 PM',
    duration: '6h 30m',
    busType: 'Luxury',
    price: 1800,
    seatsAvailable: 40,
    totalSeats: 44,
    classes: [],
    amenities: [],
    ...overrides,
  };
}

describe('departureBucket', () => {
  it('buckets 5-11 as Morning', () => {
    expect(departureBucket(5)).toBe('Morning');
    expect(departureBucket(11)).toBe('Morning');
  });

  it('buckets 12-16 as Afternoon', () => {
    expect(departureBucket(12)).toBe('Afternoon');
    expect(departureBucket(16)).toBe('Afternoon');
  });

  it('buckets 17-21 as Evening', () => {
    expect(departureBucket(17)).toBe('Evening');
    expect(departureBucket(21)).toBe('Evening');
  });

  it('buckets 22-4 as Night', () => {
    expect(departureBucket(22)).toBe('Night');
    expect(departureBucket(23)).toBe('Night');
    expect(departureBucket(0)).toBe('Night');
    expect(departureBucket(4)).toBe('Night');
  });
});

describe('toSliderHour', () => {
  it('leaves 5-23 unchanged', () => {
    expect(toSliderHour(5)).toBe(5);
    expect(toSliderHour(23)).toBe(23);
  });

  it('shifts 0-4 past midnight onto the 24-29 tail so Night stays contiguous', () => {
    expect(toSliderHour(0)).toBe(24);
    expect(toSliderHour(4)).toBe(28);
  });
});

describe('matchesFilters', () => {
  it('matches everything against an empty filter state', () => {
    expect(matchesFilters(makeBus(), emptyFilterState())).toBe(true);
  });

  it('matches OR within seatTypes: bus offering any selected class passes', () => {
    const bus = makeBus({ classes: [{ className: 'Business', price: 3500 }] });
    const filters: FilterState = { ...emptyFilterState(), seatTypes: new Set(['VIP', 'Business']) };
    expect(matchesFilters(bus, filters)).toBe(true);
  });

  it('excludes a bus offering none of the selected seatTypes', () => {
    const bus = makeBus({ classes: [{ className: 'Normal', price: 1800 }] });
    const filters: FilterState = { ...emptyFilterState(), seatTypes: new Set(['VIP']) };
    expect(matchesFilters(bus, filters)).toBe(false);
  });

  it('matches departureRange against the bus departure hour on the slider axis', () => {
    const bus = makeBus({ departureHour: 6 });
    const filters: FilterState = { ...emptyFilterState(), departureRange: { start: 5, end: 12 } };
    expect(matchesFilters(bus, filters)).toBe(true);

    const filtersWrongRange: FilterState = { ...emptyFilterState(), departureRange: { start: 17, end: 22 } };
    expect(matchesFilters(bus, filtersWrongRange)).toBe(false);
  });

  it('matches a Night departureRange against a bus departing just after midnight', () => {
    const bus = makeBus({ departureHour: 1 });
    const filters: FilterState = { ...emptyFilterState(), departureRange: { start: 22, end: 29 } };
    expect(matchesFilters(bus, filters)).toBe(true);
  });

  it('filters by amenities requiring all selected amenities present (AND within amenities)', () => {
    const bus = makeBus({ amenities: ['Wifi', 'Water'] });
    const filters: FilterState = { ...emptyFilterState(), amenities: new Set(['Wifi', 'Water']) };
    expect(matchesFilters(bus, filters)).toBe(true);

    const filtersMissing: FilterState = { ...emptyFilterState(), amenities: new Set(['Wifi', 'Tea']) };
    expect(matchesFilters(bus, filtersMissing)).toBe(false);
  });

  it('filters by operator', () => {
    const bus = makeBus({ operator: 'Tahmeed' });
    expect(matchesFilters(bus, { ...emptyFilterState(), operator: 'Tahmeed' })).toBe(true);
    expect(matchesFilters(bus, { ...emptyFilterState(), operator: 'Coast Bus' })).toBe(false);
  });

  it('requires all active categories to match (AND across categories)', () => {
    const bus = makeBus({ operator: 'Coast Bus', departureHour: 6 });
    const filters: FilterState = {
      ...emptyFilterState(),
      operator: 'Coast Bus',
      departureRange: { start: 17, end: 22 },
    };
    expect(matchesFilters(bus, filters)).toBe(false);
  });
});

describe('filterOptions', () => {
  it('derives unique, sorted operators and amenities from the given buses', () => {
    const buses = [
      makeBus({ operator: 'Tahmeed', amenities: ['Wifi'] }),
      makeBus({ operator: 'Coast Bus', amenities: ['Wifi', 'Water'] }),
      makeBus({ operator: 'Coast Bus', amenities: [] }),
    ];

    const options = filterOptions(buses);

    expect(options.operators).toEqual(['Coast Bus', 'Tahmeed']);
    expect(options.amenities).toEqual(['Water', 'Wifi']);
  });

  it('returns empty arrays for an empty bus list', () => {
    expect(filterOptions([])).toEqual({ operators: [], amenities: [] });
  });
});
