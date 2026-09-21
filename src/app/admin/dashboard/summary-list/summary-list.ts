import { Component, computed, input, output } from '@angular/core';
import { DashboardTone, WeekSummary, WidgetState } from '../../../models/admin-dashboard.model';
import { WidgetError } from '../widget-error/widget-error';

interface SummaryRow {
  icon: string;
  label: string;
  value: string;
  tone: DashboardTone;
  /** True when there is no data behind the row yet. */
  notTracked: boolean;
}

const NOT_TRACKED = 'Not tracked yet';

@Component({
  imports: [WidgetError],
  selector: 'app-summary-list',
  styleUrl: './summary-list.css',
  templateUrl: './summary-list.html',
})
export class SummaryList {
  state = input<WidgetState<WeekSummary>>({ status: 'loading' });
  retry = output<void>();

  /** One placeholder per row while loading. */
  readonly placeholders = [0, 1, 2, 3, 4];

  rows = computed<SummaryRow[]>(() => {
    const state = this.state();
    if (state.status !== 'ready') {
      return [];
    }
    const summary = state.data;
    return [
      { icon: 'fa-ticket', label: 'Tickets sold', value: summary.ticketsSold.toLocaleString(), tone: 'red', notTracked: false },
      { icon: 'fa-check', label: 'Trips completed', value: summary.tripsCompleted.toLocaleString(), tone: 'moss', notTracked: false },
      {
        icon: 'fa-rotate-left',
        label: 'Refunds issued',
        value: summary.refundsIssued === null ? NOT_TRACKED : summary.refundsIssued.toLocaleString(),
        tone: 'gold',
        notTracked: summary.refundsIssued === null,
      },
      { icon: 'fa-circle-plus', label: 'Seats still open today', value: summary.seatsOpenToday.toLocaleString(), tone: 'navy', notTracked: false },
      {
        icon: 'fa-star',
        label: 'Average rating',
        value: summary.averageRating === null ? NOT_TRACKED : summary.averageRating.toFixed(1),
        tone: 'moss',
        notTracked: summary.averageRating === null,
      },
    ];
  });
}
