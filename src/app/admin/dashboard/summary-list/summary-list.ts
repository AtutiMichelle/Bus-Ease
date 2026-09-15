import { Component, computed, input } from '@angular/core';
import { DashboardTone, WeekSummary } from '../../../models/admin-dashboard.model';

interface SummaryRow {
  icon: string;
  label: string;
  value: string;
  tone: DashboardTone;
}

@Component({
  selector: 'app-summary-list',
  styleUrl: './summary-list.css',
  templateUrl: './summary-list.html',
})
export class SummaryList {
  summary = input<WeekSummary | null>(null);

  rows = computed<SummaryRow[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    return [
      { icon: 'fa-ticket', label: 'Tickets sold', value: summary.ticketsSold.toLocaleString(), tone: 'red' },
      { icon: 'fa-check', label: 'Trips completed', value: summary.tripsCompleted.toLocaleString(), tone: 'moss' },
      { icon: 'fa-rotate-left', label: 'Refunds issued', value: summary.refundsIssued.toLocaleString(), tone: 'gold' },
      { icon: 'fa-circle-plus', label: 'Seats still open today', value: summary.seatsOpenToday.toLocaleString(), tone: 'navy' },
      { icon: 'fa-star', label: 'Average rating', value: summary.averageRating.toFixed(1), tone: 'moss' },
    ];
  });
}
