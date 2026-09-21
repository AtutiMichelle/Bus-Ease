import { Component, computed, input, output } from '@angular/core';
import { PaymentSplitData, WidgetState } from '../../../models/admin-dashboard.model';
import { WidgetError } from '../widget-error/widget-error';
import { compactAmount, formatKsh } from '../../../utils/money';

interface DonutSegment {
  label: string;
  percent: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

const RADIUS = 40;
const STROKE_WIDTH = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Small break between segments so neighbouring slices stay distinct. */
const SEGMENT_GAP = 1.2;

/** Only the single largest slice (the brand's "primary chart series") is
 * red. The others take these fills in order. The legend also gives each
 * slice's percentage, so colour is never the only way to tell them apart. */
const OTHER_SLICE_COLORS = ['var(--admin-ink)', 'var(--admin-info-text)', 'var(--admin-muted)'];

@Component({
  imports: [WidgetError],
  selector: 'app-payment-split-donut',
  styleUrl: './payment-split-donut.css',
  templateUrl: './payment-split-donut.html',
})
export class PaymentSplitDonut {
  state = input<WidgetState<PaymentSplitData>>({ status: 'loading' });
  retry = output<void>();
  readonly radius = RADIUS;
  readonly strokeWidth = STROKE_WIDTH;

  /** Placeholder legend rows shown while loading. */
  readonly placeholders = [0, 1, 2];

  private data = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  slices = computed(() => this.data()?.slices ?? []);
  totalCollected = computed(() => this.data()?.totalCollected ?? 0);
  hasData = computed(() => this.slices().length > 0 && this.totalCollected() > 0);

  private sliceColors = computed(() => {
    let otherIndex = 0;
    return this.slices().map((slice) =>
      slice.tone === 'red' ? 'var(--admin-accent)' : OTHER_SLICE_COLORS[otherIndex++ % OTHER_SLICE_COLORS.length],
    );
  });

  /** Centre of the ring: the total in short form ("389k") so it always fits
   * inside the hole. The exact figure is in the chart's aria-label. */
  totalCompact = computed(() => compactAmount(this.totalCollected()));

  legend = computed(() =>
    this.slices().map((slice, i) => ({
      label: slice.label,
      percent: slice.percent,
      amount: `KSh ${compactAmount(slice.amount)}`,
      color: this.sliceColors()[i],
    })),
  );

  segments = computed<DonutSegment[]>(() => {
    let cumulative = 0;
    return this.slices().map((slice, i) => {
      const share = (slice.percent / 100) * CIRCUMFERENCE;
      const dash = this.slices().length > 1 ? Math.max(share - SEGMENT_GAP, 0.5) : share;
      const segment: DonutSegment = {
        label: slice.label,
        percent: slice.percent,
        color: this.sliceColors()[i],
        dashArray: `${dash} ${CIRCUMFERENCE - dash}`,
        dashOffset: -cumulative,
      };
      cumulative += share;
      return segment;
    });
  });

  chartDescription = computed(() => {
    const parts = this.slices().map((slice) => `${slice.label} ${slice.percent}%`);
    return `Revenue by payment method, ${formatKsh(this.totalCollected())} collected in the last 7 days: ${parts.join(', ')}`;
  });
}
