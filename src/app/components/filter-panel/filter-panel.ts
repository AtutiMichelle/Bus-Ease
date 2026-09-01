import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Bus, BusClassOption } from '../../models/bus.model';
import {
  DEPARTURE_SLIDER_MAX,
  DEPARTURE_SLIDER_MIN,
  DEPARTURE_ZONES,
  DeparturePeriod,
  FilterState,
  HourRange,
  filterOptions,
} from '../../utils/bus-filters';
import { amenityIcon } from '../../utils/amenity-icons';

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function sameRange(a: HourRange, b: HourRange): boolean {
  return a.start === b.start && a.end === b.end;
}

type SectionKey = 'seatType' | 'departureTime' | 'amenities' | 'operator';

@Component({
  selector: 'app-filter-panel',
  styleUrl: './filter-panel.css',
  templateUrl: './filter-panel.html',
  imports: [FormsModule],
})
export class FilterPanel {
  buses = input<Bus[]>([]);
  filtersChange = output<FilterState>();

  options = computed(() => filterOptions(this.buses()));

  selectedSeatTypes = signal<Set<BusClassOption['className']>>(new Set());
  selectedAmenities = signal<Set<string>>(new Set());
  selectedOperator = signal<string | null>(null);

  readonly sliderMin = DEPARTURE_SLIDER_MIN;
  readonly sliderMax = DEPARTURE_SLIDER_MAX;
  rangeStart = signal(DEPARTURE_SLIDER_MIN);
  rangeEnd = signal(DEPARTURE_SLIDER_MAX);

  expandedSections = signal<Set<SectionKey>>(new Set(['seatType']));

  activeFilterCount = computed(
    () =>
      this.selectedSeatTypes().size +
      this.selectedAmenities().size +
      (this.selectedOperator() ? 1 : 0) +
      (this.isDepartureRangeActive() ? 1 : 0),
  );

  readonly seatTypeOptions: BusClassOption['className'][] = ['VIP', 'Business', 'Normal'];
  readonly departureZones = DEPARTURE_ZONES;

  amenityIcon = amenityIcon;

  isSectionExpanded(key: SectionKey): boolean {
    return this.expandedSections().has(key);
  }

  toggleSection(key: SectionKey): void {
    this.expandedSections.update((set) => toggleSet(set, key));
  }

  toggleSeatType(name: BusClassOption['className']): void {
    this.selectedSeatTypes.update((set) => toggleSet(set, name));
    this.emitChange();
  }

  toggleAmenity(name: string): void {
    this.selectedAmenities.update((set) => toggleSet(set, name));
    this.emitChange();
  }

  setOperator(value: string): void {
    this.selectedOperator.set(value || null);
    this.emitChange();
  }

  /** Converts a slider-axis hour (5-29, anchored at 5am) back to a real 12-hour clock label. */
  formatSliderHour(value: number): string {
    const hour24 = value % 24;
    const period = hour24 < 12 ? 'AM' : 'PM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}${period}`;
  }

  isDepartureRangeActive(): boolean {
    return this.rangeStart() !== this.sliderMin || this.rangeEnd() !== this.sliderMax;
  }

  isZoneActive(period: DeparturePeriod): boolean {
    const zone = this.departureZones.find((z) => z.period === period);
    return !!zone && sameRange({ start: this.rangeStart(), end: this.rangeEnd() }, zone.range);
  }

  toggleZone(period: DeparturePeriod): void {
    const zone = this.departureZones.find((z) => z.period === period);
    if (!zone) {
      return;
    }
    if (this.isZoneActive(period)) {
      this.rangeStart.set(this.sliderMin);
      this.rangeEnd.set(this.sliderMax);
    } else {
      this.rangeStart.set(zone.range.start);
      this.rangeEnd.set(zone.range.end);
    }
    this.emitChange();
  }

  onRangeStartInput(value: string): void {
    const next = Math.min(Number(value), this.rangeEnd());
    this.rangeStart.set(next);
    this.emitChange();
  }

  onRangeEndInput(value: string): void {
    const next = Math.max(Number(value), this.rangeStart());
    this.rangeEnd.set(next);
    this.emitChange();
  }

  clearAll(): void {
    this.selectedSeatTypes.set(new Set());
    this.selectedAmenities.set(new Set());
    this.selectedOperator.set(null);
    this.rangeStart.set(this.sliderMin);
    this.rangeEnd.set(this.sliderMax);
    this.emitChange();
  }

  private emitChange(): void {
    this.filtersChange.emit({
      seatTypes: this.selectedSeatTypes(),
      departureRange: this.isDepartureRangeActive() ? { start: this.rangeStart(), end: this.rangeEnd() } : null,
      amenities: this.selectedAmenities(),
      operator: this.selectedOperator(),
    });
  }
}
