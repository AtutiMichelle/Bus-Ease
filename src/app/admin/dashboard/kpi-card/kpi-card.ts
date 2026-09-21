import { Component, computed, input } from '@angular/core';
import { KpiCardData } from '../../../models/admin-dashboard.model';

@Component({
  selector: 'app-kpi-card',
  styleUrl: './kpi-card.css',
  templateUrl: './kpi-card.html',
})
export class KpiCard {
  card = input<KpiCardData | null>(null);
  /** Shows a placeholder card while the metrics load. */
  loading = input(false);

  sparklinePoints = computed(() => {
    const points = this.card()?.sparkline ?? [];
    if (points.length < 2) {
      return '';
    }
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const stepX = 100 / (points.length - 1);
    return points
      .map((point, i) => {
        const x = i * stepX;
        const y = 26 - ((point - min) / range) * 22;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  sparklineDescription = computed(() => {
    const card = this.card();
    if (!card) {
      return '';
    }
    const direction = card.delta.direction;
    const trendWord = direction === 'up' ? 'trending up' : direction === 'down' ? 'trending down' : 'roughly flat';
    return `${card.label} over the last 7 days, ${trendWord}`;
  });
}
