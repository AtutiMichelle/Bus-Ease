import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SearchBar } from '../../components/search-bar/search-bar';
import { SeatPanel } from '../../components/seat-panel/seat-panel';
import { FilterPanel } from '../../components/filter-panel/filter-panel';
import { BusService } from '../../services/bus.service';
import { Bus } from '../../models/bus.model';
import { todayDateString } from '../../utils/date';
import { FilterState, emptyFilterState, matchesFilters } from '../../utils/bus-filters';
import { amenityIcon, amenityColor } from '../../utils/amenity-icons';

@Component({
  imports: [SearchBar, SeatPanel, FilterPanel, DecimalPipe],
  selector: 'app-results',
  styleUrl: './results.css',
  templateUrl: './results.html',
})
export class Results {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private busService = inject(BusService);

  private queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  origin = computed(() => this.queryParamMap().get('origin') ?? '');
  destination = computed(() => this.queryParamMap().get('destination') ?? '');
  journeyDate = computed(() => this.queryParamMap().get('journeyDate') || todayDateString());
  selectedBusId = computed(() => this.queryParamMap().get('busId'));

  buses = signal<Bus[]>([]);
  loading = signal(true);
  errorMessage = signal('');

  filters = signal<FilterState>(emptyFilterState());
  filteredBuses = computed(() => this.buses().filter((bus) => matchesFilters(bus, this.filters())));

  amenityIcon = amenityIcon;
  amenityColor = amenityColor;

  /** Shown inline on each result card; kept to the first 3-4 amenities so the row stays compact. */
  cardAmenities(bus: Bus): string[] {
    return bus.amenities.slice(0, 4);
  }

  operatorInitials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
  }

  formattedDate = computed(() => {
    const raw = this.journeyDate();
    if (!raw) {
      return '';
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }
    return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  });

  constructor() {
    // A search with no date (e.g. a Popular Route click) lands here without
    // journeyDate — normalize the URL to today's date so it stays the single
    // source of truth for what's actually being searched.
    if (!this.route.snapshot.queryParamMap.get('journeyDate')) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { journeyDate: todayDateString() },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    effect(() => {
      this.load(this.origin(), this.destination(), this.journeyDate());
    });
  }

  private async load(origin: string, destination: string, journeyDate: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const buses = await this.busService.search(origin, destination, journeyDate);
      this.buses.set(buses);
    } catch {
      this.errorMessage.set('Could not load buses for this route. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  selectBus(bus: Bus): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { busId: bus.id },
      queryParamsHandling: 'merge',
    });
  }

  closeSeatPanel(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { busId: null },
      queryParamsHandling: 'merge',
    });
  }
}
