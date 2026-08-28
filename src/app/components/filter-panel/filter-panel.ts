import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Bus, BusClassOption } from '../../models/bus.model';
import { DeparturePeriod, FilterState, filterOptions } from '../../utils/bus-filters';

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
  selectedOperator = signal<string | null>(null);
  selectedBusTypes = signal<Set<string>>(new Set());

  readonly seatTypeOptions: BusClassOption['className'][] = ['VIP', 'Business', 'Normal'];

  readonly departurePeriods: { period: DeparturePeriod; icon: string }[] = [
    { period: 'Morning', icon: 'fa-sun' },
    { period: 'Afternoon', icon: 'fa-cloud-sun' },
    { period: 'Evening', icon: 'fa-cloud-moon' },
    { period: 'Night', icon: 'fa-moon' },
  ];

  readonly amenityIcons: Record<string, string> = {
    'Air Conditioning': 'fa-snowflake',
    'Dvd Player': 'fa-compact-disc',
    Wifi: 'fa-wifi',
    'Phone Charging': 'fa-plug',
    'GPS Tracking': 'fa-location-dot',
    Water: 'fa-droplet',
    Newspaper: 'fa-newspaper',
    Tea: 'fa-mug-hot',
  };

  amenityIcon(name: string): string {
    return this.amenityIcons[name] ?? 'fa-circle-check';
  }

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

  toggleBusType(name: string): void {
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
    this.selectedOperator.set(null);
    this.selectedBusTypes.set(new Set());
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
