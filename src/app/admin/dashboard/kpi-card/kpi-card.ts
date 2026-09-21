import { Component, computed, input, signal } from '@angular/core';
import { KpiCardData } from '../../../models/admin-dashboard.model';

/** Drawing area of the sparkline. The SVG stretches to the card width
 * (preserveAspectRatio="none"), so only the proportions matter. */
const CHART_WIDTH = 200;
const CHART_HEIGHT = 56;
const CHART_TOP = 6;
const CHART_BOTTOM = 3;

let nextChartId = 0;

/** "Sat 20 Sep" from an ISO date. Built from the date parts so the browser's
 * timezone can't shift it by a day. */
function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} ${day} ${monthName}`;
}

/** "20 Sep", for the two ends of the chart. */
function formatShortDay(iso: string): string {
  return formatDay(iso).split(' ').slice(1).join(' ');
}

@Component({
  selector: 'app-kpi-card',
  styleUrl: './kpi-card.css',
  templateUrl: './kpi-card.html',
})
export class KpiCard {
  card = input<KpiCardData | null>(null);
  /** Shows a placeholder card while the metrics load. */
  loading = input(false);

  /** Unique per card so each area gradient keeps its own SVG id. */
  readonly gradientId = `kpi-fill-${nextChartId++}`;

  /** Index of the day under the pointer, or null when not hovering. */
  hoverIndex = signal<number | null>(null);

  /** Line, area and point positions, scaled from zero so a quiet week reads
   * as quiet. Null when the metric has no daily series. */
  chart = computed(() => {
    const card = this.card();
    const values = card?.sparkline ?? [];
    if (!card || values.length < 2) {
      return null;
    }
    const max = Math.max(...values, 1);
    const stepX = CHART_WIDTH / (values.length - 1);
    const points = values.map((value, index) => ({
      x: index * stepX,
      y: CHART_HEIGHT - CHART_BOTTOM - (value / max) * (CHART_HEIGHT - CHART_TOP - CHART_BOTTOM),
    }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`;
    return {
      linePath,
      areaPath,
      dots: points.map((p) => ({ left: (p.x / CHART_WIDTH) * 100, top: (p.y / CHART_HEIGHT) * 100 })),
      firstDay: formatShortDay(card.sparklineDays[0] ?? ''),
      lastDay: formatShortDay(card.sparklineDays[values.length - 1] ?? ''),
      description: `${card.label} per day, ${card.sparklineDays
        .map((day, i) => `${formatDay(day)}: ${card.sparklineLabels[i]}`)
        .join(', ')}`,
    };
  });

  /** The point marked on the chart: the hovered day, else the latest day. */
  activeDot = computed(() => {
    const chart = this.chart();
    if (!chart) {
      return null;
    }
    const index = this.hoverIndex() ?? chart.dots.length - 1;
    return chart.dots[index];
  });

  /** Day and value text for the hovered point. */
  readout = computed(() => {
    const index = this.hoverIndex();
    const card = this.card();
    if (index === null || !card) {
      return null;
    }
    return { day: formatDay(card.sparklineDays[index] ?? ''), value: card.sparklineLabels[index] ?? '' };
  });

  onPointer(event: PointerEvent): void {
    const chart = this.chart();
    if (!chart) {
      return;
    }
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    this.hoverIndex.set(Math.round(ratio * (chart.dots.length - 1)));
  }
}
