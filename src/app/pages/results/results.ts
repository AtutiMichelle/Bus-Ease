import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SearchBar } from '../../components/search-bar/search-bar';
import { SeatPanel } from '../../components/seat-panel/seat-panel';
import { FilterPanel } from '../../components/filter-panel/filter-panel';
import { TravlerApiService } from '../../travler/travler-api.service';
import { travlerErrorMessage } from '../../travler/travler-errors';
import { Trip } from '../../models/trip.model';
import { todayDateString } from '../../utils/date';
import { FilterState, emptyFilterState, matchesFilters } from '../../utils/bus-filters';

/** Shown in place of an operator logo that's missing or fails to load. */
const FALLBACK_LOGO = 'logos/operator-fallback.svg';

interface ResolvedRoute {
  fromCityId: string;
  toCityId: string;
}

@Component({
  imports: [SearchBar, SeatPanel, FilterPanel, DecimalPipe],
  selector: 'app-results',
  styleUrl: './results.css',
  templateUrl: './results.html',
})
export class Results {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private travler = inject(TravlerApiService);

  private queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  origin = computed(() => this.queryParamMap().get('origin') ?? '');
  destination = computed(() => this.queryParamMap().get('destination') ?? '');
  originId = computed(() => this.queryParamMap().get('originId') ?? '');
  destinationId = computed(() => this.queryParamMap().get('destinationId') ?? '');
  journeyDate = computed(() => this.queryParamMap().get('journeyDate') || todayDateString());
  selectedBusId = computed(() => this.queryParamMap().get('busId'));

  trips = signal<Trip[]>([]);
  loading = signal(true);
  errorMessage = signal('');
  /** Set when the route itself isn't served, as opposed to no trips that day. */
  routeNotServed = signal(false);

  filters = signal<FilterState>(emptyFilterState());
  filteredTrips = computed(() => this.trips().filter((trip) => matchesFilters(trip, this.filters())));

  selectedTrip = computed(() => {
    const busId = this.selectedBusId();
    return busId ? this.trips().find((trip) => trip.id === busId) : undefined;
  });

  /** Trip ids whose logo failed to load, so they fall back to the default. */
  private brokenLogos = signal<Set<string>>(new Set());

  logoFor(trip: Trip): string {
    return trip.operatorLogo && !this.brokenLogos().has(trip.id) ? trip.operatorLogo : FALLBACK_LOGO;
  }

  onLogoError(trip: Trip): void {
    if (this.brokenLogos().has(trip.id)) {
      return;
    }
    this.brokenLogos.update((set) => new Set(set).add(trip.id));
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

  private loadToken = 0;

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
      this.load(this.origin(), this.destination(), this.originId(), this.destinationId(), this.journeyDate());
    });
  }

  /** Links that only carry city names (Popular Routes, old bookmarks) are
   * matched to the booking API's city ids by name. */
  private async resolveRoute(origin: string, destination: string, originId: string, destinationId: string): Promise<ResolvedRoute | null> {
    if (originId && destinationId) {
      return { fromCityId: originId, toCityId: destinationId };
    }
    const byName = (name: string) => (city: { name: string }) => city.name.toLowerCase() === name.trim().toLowerCase();
    const from = originId || (await this.travler.getCities()).find(byName(origin))?.id;
    if (!from) {
      return null;
    }
    const to = destinationId || (await this.travler.getCities(from)).find(byName(destination))?.id;
    return to ? { fromCityId: from, toCityId: to } : null;
  }

  private async load(origin: string, destination: string, originId: string, destinationId: string, journeyDate: string): Promise<void> {
    const token = ++this.loadToken;
    this.loading.set(true);
    this.errorMessage.set('');
    this.routeNotServed.set(false);
    try {
      const resolved = await this.resolveRoute(origin, destination, originId, destinationId);
      if (token !== this.loadToken) {
        return;
      }
      if (!resolved) {
        this.trips.set([]);
        this.routeNotServed.set(true);
        return;
      }
      const trips = await this.travler.searchTrips({ ...resolved, from: origin, to: destination, date: journeyDate });
      if (token !== this.loadToken) {
        return;
      }
      this.trips.set(trips);
    } catch (error) {
      if (token === this.loadToken) {
        this.errorMessage.set(travlerErrorMessage(error, 'Could not load trips for this route. Please try again.'));
      }
    } finally {
      if (token === this.loadToken) {
        this.loading.set(false);
      }
    }
  }

  selectTrip(trip: Trip): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { busId: trip.id },
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
