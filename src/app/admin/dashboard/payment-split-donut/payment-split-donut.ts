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
 * red; every other slice cycles through navy shades by position, not by
 * the shared red/moss/gold/navy tone (that 4-tone palette tints card
 * backgrounds elsewhere, but a donut needs as many distinguishable fills
 * as there are non-primary slices, not just one navy). */
const NAVY_SHADES = ['var(--color-primary, #12294d)', 'var(--color-primary-light, #1e88e5)', 'var(--color-primary-mid, #1c4a7a)'];

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
  /** Null means failed payments are not recorded anywhere yet. */
  failedPayments = computed(() => this.data()?.failedPayments ?? null);
  hasData = computed(() => this.slices().length > 0 && this.totalCollected() > 0);

  private sliceColors = computed(() => {
    let navyIndex = 0;
    return this.slices().map((slice) =>
      slice.tone === 'red' ? 'var(--color-accent, #eb1f1a)' : NAVY_SHADES[navyIndex++ % NAVY_SHADES.length],
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
