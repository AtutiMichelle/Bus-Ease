import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeltaDirection, TopRoutesData, WidgetState } from '../../../models/admin-dashboard.model';
import { NAV_MAIN } from '../../admin-nav';
import { WidgetError } from '../widget-error/widget-error';
import { formatKsh } from '../../../utils/money';

/** How many route names the no-sales line spells out before "and N more".
 * The full list is in the line's tooltip. */
const NO_SALES_NAMED = 2;

@Component({
  imports: [RouterLink, WidgetError],
  selector: 'app-top-routes-card',
  styleUrl: './top-routes-card.css',
  templateUrl: './top-routes-card.html',
})
export class TopRoutesCard {
  state = input<WidgetState<TopRoutesData>>({ status: 'loading' });
  retry = output<void>();

  /** Placeholder rows shown while loading, and ghost bars when empty. */
  readonly placeholders = [0, 1, 2];

  /** Where "All routes" goes. Comes from the sidebar, so the link turns on by
   * itself once the Routes page has a route. */
  readonly routesRoute = NAV_MAIN.find((item) => item.section === 'routes')?.route ?? null;

  readonly formatKsh = formatKsh;

  readonly deltaChip: Record<DeltaDirection, string> = {
    up: 'admin-chip-pos',
    down: 'admin-chip-neg',
    warning: 'admin-chip-warn',
    neutral: 'admin-chip-neutral',
  };

  /** Spoken in place of the arrow, which is decorative. */
  readonly directionWord: Record<DeltaDirection, string> = { up: 'Up ', down: 'Down ', warning: '', neutral: '' };

  private data = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  routes = computed(() => this.data()?.routes ?? []);
  maxTickets = computed(() => Math.max(1, ...this.routes().map((route) => route.ticketCount)));

  private noSalesNames = computed(() => this.data()?.noSalesRoutes ?? []);
  noSalesCount = computed(() => this.noSalesNames().length);
  noSalesAll = computed(() => this.noSalesNames().join(', '));

  /** "Mombasa → Malindi, Nairobi → Kampala and 2 more" */
  noSalesPreview = computed(() => {
    const names = this.noSalesNames();
    const named = names.slice(0, NO_SALES_NAMED).join(', ');
    const rest = names.length - NO_SALES_NAMED;
    return rest > 0 ? `${named} and ${rest} more` : named;
  });

  /** Said when there is nothing to list, and which reason it is. */
  noSalesEmptyText = computed(() =>
    this.routes().length > 0 ? 'Every route sold tickets this week.' : 'No routes are set up yet.',
  );
}
