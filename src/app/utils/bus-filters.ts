import { BusClassOption } from '../models/bus.model';

/** The fields filtering needs; both the old Bus model and the Travler Trip
 * model satisfy it. */
export interface FilterableTrip {
  operator: string;
  busType: string;
  departureHour: number;
  amenities: string[];
  classes: BusClassOption[];
}

export type DeparturePeriod = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export interface FilterState {
  seatTypes: Set<string>;
  departureTimes: Set<DeparturePeriod>;
  amenities: Set<string>;
  operator: string | null;
  busTypes: Set<string>;
}

export interface FilterOptions {
  operators: string[];
  busTypes: string[];
}

export function emptyFilterState(): FilterState {
  return {
    seatTypes: new Set(),
    departureTimes: new Set(),
    amenities: new Set(),
    operator: null,
    busTypes: new Set(),
  };
}

export function departureBucket(hour: number): DeparturePeriod {
  if (hour >= 5 && hour < 12) {
    return 'Morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'Afternoon';
  }
  if (hour >= 17 && hour < 22) {
    return 'Evening';
  }
  return 'Night';
}

export const DEPARTURE_ZONES: { period: DeparturePeriod; icon: string }[] = [
  { period: 'Morning', icon: 'fa-sun' },
  { period: 'Afternoon', icon: 'fa-cloud-sun' },
  { period: 'Evening', icon: 'fa-cloud-moon' },
  { period: 'Night', icon: 'fa-moon' },
];

/** Fixed 2x2 amenity tile set per the filter sidebar spec, mapped to the
 * underlying amenity names stored on each bus. */
export const AMENITY_ZONES: { label: string; icon: string; amenity: string }[] = [
  { label: 'AC', icon: 'fa-snowflake', amenity: 'Air Conditioning' },
  { label: 'Wifi', icon: 'fa-wifi', amenity: 'Wifi' },
  { label: 'Charging', icon: 'fa-bolt', amenity: 'Phone Charging' },
  { label: 'Water', icon: 'fa-droplet', amenity: 'Water' },
];

export function matchesFilters(bus: FilterableTrip, filters: FilterState): boolean {
  if (filters.seatTypes.size > 0 && !bus.classes.some((cls) => filters.seatTypes.has(cls.className))) {
    return false;
  }

  if (filters.departureTimes.size > 0 && !filters.departureTimes.has(departureBucket(bus.departureHour))) {
    return false;
  }

  for (const amenity of filters.amenities) {
    if (!bus.amenities.includes(amenity)) {
      return false;
    }
  }

  if (filters.operator && bus.operator !== filters.operator) {
    return false;
  }

  if (filters.busTypes.size > 0 && !filters.busTypes.has(bus.busType)) {
    return false;
  }

  return true;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

export function filterOptions(buses: FilterableTrip[]): FilterOptions {
  return {
    operators: uniqueSorted(buses.map((bus) => bus.operator)),
    busTypes: uniqueSorted(buses.map((bus) => bus.busType)),
  };
}
