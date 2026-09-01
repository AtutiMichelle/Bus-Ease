import { Bus } from '../models/bus.model';

export type DeparturePeriod = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export interface HourRange {
  start: number;
  end: number;
}

export interface FilterState {
  seatTypes: Set<string>;
  departureRange: HourRange | null;
  amenities: Set<string>;
  operator: string | null;
}

export interface FilterOptions {
  operators: string[];
  amenities: string[];
}

export function emptyFilterState(): FilterState {
  return {
    seatTypes: new Set(),
    departureRange: null,
    amenities: new Set(),
    operator: null,
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

/** Maps a 0-23 departure hour onto a 5-29 axis anchored at 5am, so the Night
 * zone (22:00-05:00) is one contiguous span instead of wrapping past midnight. */
export function toSliderHour(hour: number): number {
  return hour < 5 ? hour + 24 : hour;
}

export const DEPARTURE_SLIDER_MIN = 5;
export const DEPARTURE_SLIDER_MAX = 29;

export const DEPARTURE_ZONES: { period: DeparturePeriod; icon: string; range: HourRange }[] = [
  { period: 'Morning', icon: 'fa-sun', range: { start: 5, end: 12 } },
  { period: 'Afternoon', icon: 'fa-cloud-sun', range: { start: 12, end: 17 } },
  { period: 'Evening', icon: 'fa-cloud-moon', range: { start: 17, end: 22 } },
  { period: 'Night', icon: 'fa-moon', range: { start: 22, end: 29 } },
];

export function matchesFilters(bus: Bus, filters: FilterState): boolean {
  if (filters.seatTypes.size > 0 && !bus.classes.some((cls) => filters.seatTypes.has(cls.className))) {
    return false;
  }

  if (filters.departureRange) {
    const sliderHour = toSliderHour(bus.departureHour);
    if (sliderHour < filters.departureRange.start || sliderHour >= filters.departureRange.end) {
      return false;
    }
  }

  for (const amenity of filters.amenities) {
    if (!bus.amenities.includes(amenity)) {
      return false;
    }
  }

  if (filters.operator && bus.operator !== filters.operator) {
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
    amenities: uniqueSorted(buses.flatMap((bus) => bus.amenities)),
  };
}
