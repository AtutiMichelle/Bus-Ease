import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TopRoutesData } from '../../../models/admin-dashboard.model';

@Component({
  imports: [DecimalPipe],
  selector: 'app-top-routes-card',
  styleUrl: './top-routes-card.css',
  templateUrl: './top-routes-card.html',
})
export class TopRoutesCard {
  data = input<TopRoutesData | null>(null);

  routes = computed(() => this.data()?.routes ?? []);
  noSalesRoutes = computed(() => this.data()?.noSalesRoutes ?? []);
  maxTickets = computed(() => Math.max(1, ...this.routes().map((route) => route.ticketCount)));

  noSalesFooterText = computed(() => {
    const names = this.noSalesRoutes();
    if (names.length === 0) {
      return '';
    }
    const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
    const routeWord = names.length === 1 ? 'route' : 'routes';
    return `${list} ${routeWord} had no sales this week.`;
  });
}
