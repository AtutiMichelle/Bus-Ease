import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WeekSummary, WidgetState } from '../../../models/admin-dashboard.model';
import { NAV_SYSTEM } from '../../admin-nav';
import { WidgetError } from '../widget-error/widget-error';

interface SummaryRow {
  label: string;
  value: string;
}

@Component({
  imports: [RouterLink, WidgetError],
  selector: 'app-summary-list',
  styleUrl: './summary-list.css',
  templateUrl: './summary-list.html',
})
export class SummaryList {
  state = input<WidgetState<WeekSummary>>({ status: 'loading' });
  retry = output<void>();

  /** One placeholder per row while loading. */
  readonly placeholders = [0, 1, 2];

  /** Where "Set up" goes. Comes from the sidebar, so the link turns on by
   * itself once Settings has a route. */
  readonly setupRoute = NAV_SYSTEM.find((item) => item.section === 'settings')?.route ?? null;

  private summary = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  /** Only the numbers that can actually be measured. Refunds and ratings
   * have no data behind them yet, so they get one line below instead of two
   * rows of "not tracked". */
  rows = computed<SummaryRow[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    const rows: SummaryRow[] = [
      { label: 'Tickets sold', value: summary.ticketsSold.toLocaleString('en-US') },
      { label: 'Trips completed', value: summary.tripsCompleted.toLocaleString('en-US') },
      { label: 'Seats open on upcoming trips', value: summary.seatsOpenToday.toLocaleString('en-US') },
    ];
    if (summary.refundsIssued !== null) {
      rows.push({ label: 'Refunds issued', value: summary.refundsIssued.toLocaleString('en-US') });
    }
    if (summary.averageRating !== null) {
      rows.push({ label: 'Average rating', value: summary.averageRating.toFixed(1) });
    }
    return rows;
  });

  /** The single "not tracked yet" line, or empty when everything is tracked. */
  untrackedText = computed(() => {
    const summary = this.summary();
    if (!summary) {
      return '';
    }
    const refunds = summary.refundsIssued === null;
    const ratings = summary.averageRating === null;
    if (refunds && ratings) {
      return 'Refunds and ratings are not tracked yet';
    }
    if (refunds) {
      return 'Refunds are not tracked yet';
    }
    return ratings ? 'Ratings are not tracked yet' : '';
  });
}
