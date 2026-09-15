import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RecentBooking } from '../../../models/admin-dashboard.model';

function formatBookedAt(iso: string): string {
  const date = new Date(iso);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${month} ${date.getDate()}, ${time}`;
}

@Component({
  imports: [DecimalPipe, RouterLink],
  selector: 'app-bookings-table',
  styleUrl: './bookings-table.css',
  templateUrl: './bookings-table.html',
})
export class BookingsTable {
  bookings = input<RecentBooking[]>([]);
  title = input('Recent bookings');
  /** The dashboard's preview card links to the full Bookings page; the
   * Bookings page itself reuses this component too, where that link
   * wouldn't make sense. */
  showViewAll = input(true);
  emptyMessage = input('No bookings yet. New bookings will show up here as customers pay for tickets.');
  formatBookedAt = formatBookedAt;
}
