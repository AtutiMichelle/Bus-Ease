import { Bus } from '../models/bus.model';
import { departureBucket, matchesFilters, filterOptions, emptyFilterState, FilterState } from './bus-filters';

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

  it('matches departureTimes against the bus departure bucket', () => {
    const bus = makeBus({ departureHour: 6 });
    const filters: FilterState = { ...emptyFilterState(), departureTimes: new Set(['Morning']) };
    expect(matchesFilters(bus, filters)).toBe(true);

    const filtersWrongBucket: FilterState = { ...emptyFilterState(), departureTimes: new Set(['Evening']) };
    expect(matchesFilters(bus, filtersWrongBucket)).toBe(false);
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

  it('filters by busTypes (OR within category)', () => {
    const bus = makeBus({ busType: 'Express' });
    expect(matchesFilters(bus, { ...emptyFilterState(), busTypes: new Set(['Luxury', 'Express']) })).toBe(true);
    expect(matchesFilters(bus, { ...emptyFilterState(), busTypes: new Set(['Luxury']) })).toBe(false);
  });

  it('requires all active categories to match (AND across categories)', () => {
    const bus = makeBus({ operator: 'Coast Bus', busType: 'Luxury' });
    const filters: FilterState = { ...emptyFilterState(), operator: 'Coast Bus', busTypes: new Set(['Express']) };
    expect(matchesFilters(bus, filters)).toBe(false);
  });
});

describe('filterOptions', () => {
  it('derives unique, sorted operators, busTypes, and amenities from the given buses', () => {
    const buses = [
      makeBus({ operator: 'Tahmeed', busType: 'Express', amenities: ['Wifi'] }),
      makeBus({ operator: 'Coast Bus', busType: 'Luxury', amenities: ['Wifi', 'Water'] }),
      makeBus({ operator: 'Coast Bus', busType: 'Luxury', amenities: [] }),
    ];

    const options = filterOptions(buses);

    expect(options.operators).toEqual(['Coast Bus', 'Tahmeed']);
    expect(options.busTypes).toEqual(['Express', 'Luxury']);
    expect(options.amenities).toEqual(['Water', 'Wifi']);
  });

  it('returns empty arrays for an empty bus list', () => {
    expect(filterOptions([])).toEqual({ operators: [], busTypes: [], amenities: [] });
  });
});
