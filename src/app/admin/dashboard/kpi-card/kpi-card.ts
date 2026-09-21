import { Component, input } from '@angular/core';
import { DeltaDirection, KpiCardData } from '../../../models/admin-dashboard.model';
import { ICONS } from '../../admin-nav';
import { AdminIcon } from '../../icon/admin-icon';

@Component({
  imports: [AdminIcon],
  selector: 'app-kpi-card',
  styleUrl: './kpi-card.css',
  templateUrl: './kpi-card.html',
})
export class KpiCard {
  card = input<KpiCardData | null>(null);
  /** Shows a placeholder card while the metrics load. */
  loading = input(false);

  readonly icons = ICONS;

  readonly chipClass: Record<DeltaDirection, string> = {
    up: 'admin-chip-pos',
    down: 'admin-chip-neg',
    warning: 'admin-chip-warn',
    neutral: 'admin-chip-neutral',
  };

  /** Spoken in place of the arrow, which is decorative. */
  readonly directionWord: Record<DeltaDirection, string> = {
    up: 'Up ',
    down: 'Down ',
    warning: '',
    neutral: '',
  };
}
