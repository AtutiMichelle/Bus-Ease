import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TopRoutesData, WidgetState } from '../../../models/admin-dashboard.model';
import { WidgetError } from '../widget-error/widget-error';

@Component({
  imports: [DecimalPipe, WidgetError],
  selector: 'app-top-routes-card',
  styleUrl: './top-routes-card.css',
  templateUrl: './top-routes-card.html',
})
export class TopRoutesCard {
  state = input<WidgetState<TopRoutesData>>({ status: 'loading' });
  retry = output<void>();

  /** Placeholder rows shown while loading. */
  readonly placeholders = [0, 1, 2];

  private data = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  routes = computed(() => this.data()?.routes ?? []);
  noSalesRoutes = computed(() => this.data()?.noSalesRoutes ?? []);
  maxTickets = computed(() => Math.max(1, ...this.routes().map((route) => route.ticketCount)));

  noSalesFooterText = computed(() => {
    const names = this.noSalesRoutes();
    if (names.length === 0) {
      return '';
    }
    const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
    return `No sales this week on ${list}.`;
  });
}
