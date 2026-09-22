import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminBookingsService } from '../../../services/admin-bookings.service';
import { BookingStatusTag, RecentBooking } from '../../../models/admin-dashboard.model';
import { BookingsTable } from '../../dashboard/bookings-table/bookings-table';
import { AdminPagination } from '../../shared/pagination/pagination';

type StatusFilter = 'all' | BookingStatusTag;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Paid', label: 'Paid' },
  { id: 'Unpaid', label: 'Unpaid' },
  { id: 'Refunded', label: 'Refunded' },
];

@Component({
  imports: [FormsModule, BookingsTable, AdminPagination],
  selector: 'app-bookings-page',
  styleUrl: './bookings-page.css',
  templateUrl: './bookings-page.html',
})
export class BookingsPage {
  private bookingsService = inject(AdminBookingsService);

  readonly statusFilters = STATUS_FILTERS;
  readonly pageSize = 10;

  allBookings = signal<RecentBooking[]>([]);
  loading = signal(true);
  error = signal('');

  statusFilter = signal<StatusFilter>('all');
  searchQuery = signal('');
  page = signal(1);

  filteredBookings = computed(() => {
    const status = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();
    return this.allBookings().filter((booking) => {
      if (status !== 'all' && booking.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        booking.customerName.toLowerCase().includes(query) ||
        booking.route.toLowerCase().includes(query) ||
        booking.reference.toLowerCase().includes(query)
      );
    });
  });

  private hasActiveFilters = computed(() => this.statusFilter() !== 'all' || this.searchQuery().trim().length > 0);

  emptyMessage = computed(() =>
    this.hasActiveFilters()
      ? 'No bookings match your filters. Try a different search or status.'
      : 'No bookings yet. New bookings will show up here as customers pay for tickets.',
  );

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredBookings().length / this.pageSize)));
  currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  pagedBookings = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredBookings().slice(start, start + this.pageSize);
  });

  setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
    this.page.set(1);
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.allBookings.set(await this.bookingsService.getAllBookings());
    } catch {
      this.error.set('Could not load bookings. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
