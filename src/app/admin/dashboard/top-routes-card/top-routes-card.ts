import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeltaDirection, TopRoutesData, WidgetState } from '../../../models/admin-dashboard.model';
import { NAV_MAIN } from '../../admin-nav';
import { WidgetError } from '../widget-error/widget-error';
import { formatKsh } from '../../../utils/money';

/** Badge code from "Origin → Destination", matching the service's codes. */
function routeCode(name: string): string {
  const destination = name.split('→').pop() ?? name;
  return destination.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

@Component({
  imports: [RouterLink, WidgetError],
  selector: 'app-top-routes-card',
  styleUrl: './top-routes-card.css',
  templateUrl: './top-routes-card.html',
})
export class TopRoutesCard {
  state = input<WidgetState<TopRoutesData>>({ status: 'loading' });
  retry = output<void>();

  /** Placeholder rows shown while loading, and how many rows the list fills. */
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

  /** Routes with no sales fill the ranking's empty slots as greyed-out rows,
   * so a quiet week still reads as a ranking, not one row and a gap. */
  idleRoutes = computed(() =>
    (this.data()?.noSalesRoutes ?? [])
      .slice(0, Math.max(0, this.placeholders.length - this.routes().length))
      .map((name) => ({ name, code: routeCode(name) })),
  );
}
