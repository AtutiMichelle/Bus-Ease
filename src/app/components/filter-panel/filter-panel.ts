import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Bus, BusClassOption } from '../../models/bus.model';
import { AMENITY_ZONES, DEPARTURE_ZONES, DeparturePeriod, FilterState, filterOptions } from '../../utils/bus-filters';

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

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
  selectedDepartureTimes = signal<Set<DeparturePeriod>>(new Set());
  selectedAmenities = signal<Set<string>>(new Set());
  selectedBusTypes = signal<Set<Bus['busType']>>(new Set());
  selectedOperator = signal<string | null>(null);

  readonly seatTypeOptions: BusClassOption['className'][] = ['Normal', 'Business', 'VIP'];
  readonly departureZones = DEPARTURE_ZONES;
  readonly amenityZones = AMENITY_ZONES;

  seatTypeCounts = computed(() => {
    const buses = this.buses();
    const counts = new Map<string, number>();
    for (const seatType of this.seatTypeOptions) {
      counts.set(seatType, buses.filter((bus) => bus.classes.some((cls) => cls.className === seatType)).length);
    }
    return counts;
  });

  busTypeCounts = computed(() => {
    const buses = this.buses();
    const counts = new Map<string, number>();
    for (const busType of this.options().busTypes) {
      counts.set(busType, buses.filter((bus) => bus.busType === busType).length);
    }
    return counts;
  });

  operatorCounts = computed(() => {
    const buses = this.buses();
    const counts = new Map<string, number>();
    for (const operator of this.options().operators) {
      counts.set(operator, buses.filter((bus) => bus.operator === operator).length);
    }
    return counts;
  });

  toggleSeatType(name: BusClassOption['className']): void {
    this.selectedSeatTypes.update((set) => toggleSet(set, name));
    this.emitChange();
  }

  toggleDepartureTime(period: DeparturePeriod): void {
    this.selectedDepartureTimes.update((set) => toggleSet(set, period));
    this.emitChange();
  }

  toggleAmenity(name: string): void {
    this.selectedAmenities.update((set) => toggleSet(set, name));
    this.emitChange();
  }

  toggleBusType(name: Bus['busType']): void {
    this.selectedBusTypes.update((set) => toggleSet(set, name));
    this.emitChange();
  }

  setOperator(value: string): void {
    this.selectedOperator.set(value || null);
    this.emitChange();
  }

  clearAll(): void {
    this.selectedSeatTypes.set(new Set());
    this.selectedDepartureTimes.set(new Set());
    this.selectedAmenities.set(new Set());
    this.selectedBusTypes.set(new Set());
    this.selectedOperator.set(null);
    this.emitChange();
  }

  private emitChange(): void {
    this.filtersChange.emit({
      seatTypes: this.selectedSeatTypes(),
      departureTimes: this.selectedDepartureTimes(),
      amenities: this.selectedAmenities(),
      operator: this.selectedOperator(),
      busTypes: this.selectedBusTypes(),
    });
  }
}
