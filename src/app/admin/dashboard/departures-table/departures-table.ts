import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DASHBOARD_LIST_LIMIT, Departure, DepartureStatus } from '../../../models/admin-dashboard.model';
import { NAV_MAIN } from '../../admin-nav';
import { WidgetError } from '../widget-error/widget-error';

@Component({
  imports: [RouterLink, WidgetError],
  selector: 'app-departures-table',
  styleUrl: './departures-table.css',
  templateUrl: './departures-table.html',
})
export class DeparturesTable {
  /** Already sorted and limited by the database (boarding and upcoming first,
   * departed last). */
  departures = input<Departure[]>([]);
  /** How many trips run today in all, which can be more than are listed. */
  total = input(0);
  loading = input(false);
  error = input(false);
  retry = output<void>();

  readonly placeholders = Array.from({ length: DASHBOARD_LIST_LIMIT }, (_, index) => index);

  /** Where "View all trips" goes. Comes from the sidebar, so the link turns on
   * by itself once the Trips page has a route. */
  readonly tripsRoute = NAV_MAIN.find((item) => item.section === 'fleet')?.route ?? null;

  readonly statusChip: Record<DepartureStatus, string> = {
    Departed: 'admin-chip-info',
    Boarding: 'admin-chip-pos',
    Scheduled: 'admin-chip-neutral',
    Delayed: 'admin-chip-warn',
  };

  // Never more than the card has room for, whatever the caller passes.
  rows = computed(() => this.departures().slice(0, DASHBOARD_LIST_LIMIT));
  hasSpareSpace = computed(() => this.rows().length < DASHBOARD_LIST_LIMIT);
  trueTotal = computed(() => Math.max(this.total(), this.rows().length));

  chipText = computed(() => `${this.trueTotal()} ${this.trueTotal() === 1 ? 'trip' : 'trips'}`);

  emptyMessage = computed(() =>
    this.rows().length === 0 ? 'No trips are scheduled to depart today.' : "That's every trip for today.",
  );

  footerText = computed(() => {
    const total = this.trueTotal();
    if (total === 0) {
      return 'No trips scheduled today';
    }
    return `Showing ${this.rows().length} of ${total} ${total === 1 ? 'trip' : 'trips'} today`;
  });

  fillPercent(departure: Departure): number {
    return departure.totalSeats > 0 ? Math.round((departure.seatsSold / departure.totalSeats) * 100) : 0;
  }

  isNearCapacity(departure: Departure): boolean {
    return departure.totalSeats > 0 && departure.seatsSold / departure.totalSeats > 0.95;
  }
}
