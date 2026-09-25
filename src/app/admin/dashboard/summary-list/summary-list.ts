import { Component, computed, input, output } from '@angular/core';
import { WeekSummary, WidgetState } from '../../../models/admin-dashboard.model';
import { ICONS, IconName } from '../../admin-nav';
import { AdminIcon } from '../../icon/admin-icon';
import { WidgetError } from '../widget-error/widget-error';

interface SummaryRow {
  label: string;
  value: string;
}

/** Share of seats sold on trips that ran, or "No trips" when none ran, so
 * an empty period is not shown as 0% full. */
function seatsFilled(sold: number, total: number): string {
  return total > 0 ? `${Math.round((sold / total) * 100)}%` : 'No trips';
}

@Component({
  imports: [AdminIcon, WidgetError],
  selector: 'app-summary-list',
  styleUrl: './summary-list.css',
  templateUrl: './summary-list.html',
})
export class SummaryList {
  state = input<WidgetState<WeekSummary>>({ status: 'loading' });
  retry = output<void>();

  /** One placeholder per row while loading. */
  readonly placeholders = [0, 1, 2, 3];

  readonly icons = ICONS;

  /** Icon shown beside each row, by its label. */
  readonly rowIcon: Record<string, IconName> = {
    'Seats filled': 'chart',
    'Trips completed': 'check',
    'Trips in the next 7 days': 'bus',
    'Seats open on upcoming trips': 'seat',
    'Refunds issued': 'refund',
    'Average rating': 'star',
  };

  private summary = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  /** Tickets sold is left out on purpose: the stat cards above already show
   * it. Only the numbers that can actually be measured. Refunds and ratings
   * have no data behind them yet, so they are left out until they do. */
  rows = computed<SummaryRow[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    const rows: SummaryRow[] = [
      { label: 'Seats filled', value: seatsFilled(summary.seatsSold, summary.seatsTotal) },
      { label: 'Trips completed', value: summary.tripsCompleted.toLocaleString('en-US') },
      { label: 'Trips in the next 7 days', value: summary.tripsUpcoming.toLocaleString('en-US') },
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
}
