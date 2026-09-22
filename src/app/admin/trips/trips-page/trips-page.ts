import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminTripsService } from '../../../services/admin-trips.service';
import { AdminRoutesService } from '../../../services/admin-routes.service';
import { AdminOperator, AdminRoute, AdminTrip, TripStatus } from '../../../models/admin-fleet.model';
import { TripForm } from '../trip-form/trip-form';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { AdminIcon } from '../../icon/admin-icon';
import { WidgetError } from '../../dashboard/widget-error/widget-error';
import { AdminPagination } from '../../shared/pagination/pagination';
import { ICONS } from '../../admin-nav';

type StatusFilter = 'all' | TripStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'boarding', label: 'Boarding' },
  { id: 'departed', label: 'Departed' },
];

/** Same 30-minute boarding window as admin_departures_today() in
 * supabase/sql/2026-09-21-admin-dashboard.sql, applied client-side since
 * this list spans every trip, not just today's. */
function tripStatus(departureTime: string, now: Date): TripStatus {
  const departure = new Date(departureTime.replace(' ', 'T'));
  if (departure.getTime() <= now.getTime()) {
    return 'departed';
  }
  if (departure.getTime() <= now.getTime() + 30 * 60 * 1000) {
    return 'boarding';
  }
  return 'scheduled';
}

@Component({
  imports: [FormsModule, DecimalPipe, TripForm, ConfirmDialog, AdminIcon, WidgetError, AdminPagination],
  selector: 'app-trips-page',
  styleUrl: './trips-page.css',
  templateUrl: './trips-page.html',
})
export class TripsPage {
  private tripsService = inject(AdminTripsService);
  private routesService = inject(AdminRoutesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly icons = ICONS;
  readonly statusFilters = STATUS_FILTERS;
  readonly pageSize = 10;

  trips = signal<AdminTrip[]>([]);
  routesList = signal<AdminRoute[]>([]);
  operators = signal<AdminOperator[]>([]);
  loading = signal(true);
  error = signal(false);

  searchQuery = signal('');
  statusFilter = signal<StatusFilter>('all');
  page = signal(1);

  formTarget = signal<AdminTrip | 'new' | null>(null);
  deleteTarget = signal<AdminTrip | null>(null);
  deleteBusy = signal(false);
  deleteError = signal('');

  private now = signal(new Date());

  tripsWithStatus = computed(() => {
    const now = this.now();
    return this.trips().map((trip) => ({ trip, status: tripStatus(trip.departureTime, now) }));
  });

  filteredTrips = computed(() => {
    const status = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();
    return this.tripsWithStatus().filter(({ trip, status: tripState }) => {
      if (status !== 'all' && tripState !== status) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        trip.origin.toLowerCase().includes(query) ||
        trip.destination.toLowerCase().includes(query) ||
        trip.operatorName.toLowerCase().includes(query)
      );
    });
  });

  private hasActiveFilters = computed(() => this.statusFilter() !== 'all' || this.searchQuery().trim().length > 0);

  emptyMessage = computed(() =>
    this.hasActiveFilters()
      ? 'No trips match your filters. Try a different search or status.'
      : 'No trips yet. Publish your first trip to get started.',
  );

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredTrips().length / this.pageSize)));

  /** Clamped so a delete that empties the last page falls back to the
   * previous one instead of showing a blank page. */
  currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  pagedTrips = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredTrips().slice(start, start + this.pageSize);
  });

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  constructor() {
    this.load();
    this.loadFormData();

    if (this.route.snapshot.queryParamMap.get('new') === '1') {
      this.formTarget.set('new');
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.trips.set(await this.tripsService.list());
      this.now.set(new Date());
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFormData(): Promise<void> {
    try {
      const [routes, operators] = await Promise.all([this.routesService.list(), this.tripsService.listOperators()]);
      this.routesList.set(routes);
      this.operators.set(operators);
    } catch {
      // The route/operator pickers just come up empty; the trip list itself
      // still loads and shows its own error independently.
    }
  }

  setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
    this.page.set(1);
  }

  openCreate(): void {
    this.formTarget.set('new');
  }

  openEdit(trip: AdminTrip): void {
    this.formTarget.set(trip);
  }

  closeForm(): void {
    this.formTarget.set(null);
  }

  onSaved(): void {
    this.formTarget.set(null);
    this.load();
  }

  formTrip(): AdminTrip | null {
    const target = this.formTarget();
    return target === 'new' || target === null ? null : target;
  }

  confirmDelete(trip: AdminTrip): void {
    this.deleteError.set('');
    this.deleteTarget.set(trip);
  }

  cancelDelete(): void {
    if (this.deleteBusy()) {
      return;
    }
    this.deleteTarget.set(null);
  }

  async performDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.deleteBusy.set(true);
    this.deleteError.set('');
    try {
      await this.tripsService.delete(target.id);
      this.deleteTarget.set(null);
      this.load();
    } catch (err) {
      this.deleteError.set(err instanceof Error ? err.message : 'Could not delete the trip. Please try again.');
    } finally {
      this.deleteBusy.set(false);
    }
  }

  formatWhen(value: string): string {
    return new Date(value.replace(' ', 'T')).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  readonly statusChip: Record<TripStatus, string> = {
    departed: 'admin-chip-info',
    boarding: 'admin-chip-pos',
    scheduled: 'admin-chip-neutral',
  };

  readonly statusLabel: Record<TripStatus, string> = {
    departed: 'Departed',
    boarding: 'Boarding',
    scheduled: 'Scheduled',
  };
}
