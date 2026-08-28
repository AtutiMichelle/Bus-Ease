import { Bus } from '../models/bus.model';

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
  amenities: string[];
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

export function matchesFilters(bus: Bus, filters: FilterState): boolean {
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function filterOptions(buses: Bus[]): FilterOptions {
  return {
    operators: uniqueSorted(buses.map((bus) => bus.operator)),
    busTypes: uniqueSorted(buses.map((bus) => bus.busType)),
    amenities: uniqueSorted(buses.flatMap((bus) => bus.amenities)),
  };
}
