import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeltaDirection, TopRoutesData, WidgetState } from '../../../models/admin-dashboard.model';
import { NAV_MAIN } from '../../admin-nav';
import { WidgetError } from '../widget-error/widget-error';

/** At most this many chips are shown in the no-sales list, counting a
 * "+N more" chip. Each chip is at most half the card wide, so the list is
 * never more than two rows and can't make the card grow. */
const MAX_NO_SALES_CHIPS = 4;

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

  /** Names to show. When there are too many, the last chip becomes "+N more". */
  noSalesShown = computed(() => {
    const names = this.data()?.noSalesRoutes ?? [];
    return names.length <= MAX_NO_SALES_CHIPS ? names : names.slice(0, MAX_NO_SALES_CHIPS - 1);
  });
  noSalesMore = computed(() => (this.data()?.noSalesRoutes.length ?? 0) - this.noSalesShown().length);

  /** Said when there is nothing to list, and which reason it is. */
  noSalesEmptyText = computed(() =>
    this.routes().length > 0 ? 'Every route sold tickets this week.' : 'No routes are set up yet.',
  );
}
