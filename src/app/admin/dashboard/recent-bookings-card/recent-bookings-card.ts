import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingStatusTag, DASHBOARD_LIST_LIMIT, RecentBooking } from '../../../models/admin-dashboard.model';
import { WidgetError } from '../widget-error/widget-error';

/** The dashboard's latest-bookings preview: always at most 5 rows of a fixed
 * height. The Bookings page has its own full list (bookings-table). */
@Component({
  imports: [DecimalPipe, RouterLink, WidgetError],
  selector: 'app-recent-bookings-card',
  styleUrl: './recent-bookings-card.css',
  templateUrl: './recent-bookings-card.html',
})
export class RecentBookingsCard {
  /** Already limited by the database, newest first. */
  bookings = input<RecentBooking[]>([]);
  loading = input(false);
  error = input(false);
  retry = output<void>();

  readonly placeholders = Array.from({ length: DASHBOARD_LIST_LIMIT }, (_, index) => index);

  readonly statusChip: Record<BookingStatusTag, string> = {
    Paid: 'admin-chip-pos',
    Unpaid: 'admin-chip-warn',
    Refunded: 'admin-chip-neutral',
  };

  // Never more than the card has room for, whatever the caller passes.
  rows = computed(() => this.bookings().slice(0, DASHBOARD_LIST_LIMIT));
  hasSpareSpace = computed(() => this.rows().length < DASHBOARD_LIST_LIMIT);

  emptyMessage = computed(() =>
    this.rows().length === 0
      ? 'No bookings yet. New bookings will show up here as customers pay for tickets.'
      : 'New bookings will show up here.',
  );

  footerText = computed(() => {
    const count = this.rows().length;
    if (count === 0) {
      return 'No bookings yet';
    }
    if (count < DASHBOARD_LIST_LIMIT) {
      return `Showing all ${count} ${count === 1 ? 'booking' : 'bookings'}`;
    }
    return `Showing the latest ${count} bookings`;
  });
}
