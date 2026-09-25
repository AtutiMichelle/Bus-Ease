import { Component, computed, input, output } from '@angular/core';
import { PaymentSplitData, WidgetState } from '../../../models/admin-dashboard.model';
import { WidgetError } from '../widget-error/widget-error';
import { formatKsh } from '../../../utils/money';

/** One colour per payment method, so a method keeps its colour whatever its
 * rank or whichever others are present. Checked with the dataviz palette
 * validator (lightness, chroma and colour-blind separation all pass; the
 * light blue is below 3:1 on white, which is why every segment is labelled in
 * the legend with its amount and share). */
const METHOD_COLORS: Record<string, string> = {
  'M-Pesa': 'var(--admin-chart-mpesa)',
  Card: 'var(--admin-chart-card)',
  'BusEase wallet': 'var(--admin-chart-wallet)',
};

/** "Not recorded" and any method not listed above. */
const OTHER_COLOR = 'var(--admin-chart-other)';

/** Part-to-whole as one stacked bar under the headline total, with the
 * breakdown listed below it. */
@Component({
  imports: [WidgetError],
  selector: 'app-payment-split-donut',
  styleUrl: './payment-split-donut.css',
  templateUrl: './payment-split-donut.html',
})
export class PaymentSplitDonut {
  state = input<WidgetState<PaymentSplitData>>({ status: 'loading' });
  retry = output<void>();

  /** Placeholder legend rows shown while loading. */
  readonly placeholders = [0, 1, 2];

  private data = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  slices = computed(() => this.data()?.slices ?? []);
  totalCollected = computed(() => this.data()?.totalCollected ?? 0);
  hasData = computed(() => this.slices().length > 0 && this.totalCollected() > 0);

  totalFull = computed(() => formatKsh(this.totalCollected()));

  legend = computed(() =>
    this.slices().map((slice) => ({
      label: slice.label,
      percent: slice.percent,
      // Segment widths use the raw amount so a rounded 0% slice still shows.
      share: slice.amount,
      amount: formatKsh(slice.amount),
      color: METHOD_COLORS[slice.label] ?? OTHER_COLOR,
    })),
  );

  /** Explains a "Not recorded" share when there is one, otherwise names the
   * method most customers use. */
  footerText = computed(() => {
    const slices = this.slices();
    const unrecorded = slices.find((slice) => slice.label === 'Not recorded');
    if (unrecorded && unrecorded.percent === 100) {
      return 'The payment method is not saved on bookings yet';
    }
    if (unrecorded) {
      return `${unrecorded.percent}% of revenue has no payment method saved`;
    }
    const top = slices.reduce((best, slice) => (slice.amount > best.amount ? slice : best), slices[0]);
    return `Most revenue comes through ${top.label}`;
  });

  chartDescription = computed(() => {
    const parts = this.slices().map((slice) => `${slice.label} ${slice.percent}%`);
    return `Revenue by payment method, ${formatKsh(this.totalCollected())} collected in the last 7 days: ${parts.join(', ')}`;
  });
}
