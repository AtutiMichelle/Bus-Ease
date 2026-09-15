import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PaymentSplitData } from '../../../models/admin-dashboard.model';

interface DonutSegment {
  label: string;
  percent: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Only the single largest slice (the brand's "primary chart series") is
 * red; every other slice cycles through navy shades by position, not by
 * the shared red/moss/gold/navy tone (that 4-tone palette tints card
 * backgrounds elsewhere, but a donut needs as many distinguishable fills
 * as there are non-primary slices, not just one navy). */
const NAVY_SHADES = ['var(--color-primary, #12294d)', 'var(--color-primary-light, #1e88e5)', 'var(--color-primary-mid, #1c4a7a)'];

@Component({
  imports: [DecimalPipe],
  selector: 'app-payment-split-donut',
  styleUrl: './payment-split-donut.css',
  templateUrl: './payment-split-donut.html',
})
export class PaymentSplitDonut {
  data = input<PaymentSplitData | null>(null);
  readonly radius = RADIUS;

  slices = computed(() => this.data()?.slices ?? []);
  totalCollected = computed(() => this.data()?.totalCollected ?? 0);
  failedPayments = computed(() => this.data()?.failedPayments ?? 0);
  hasData = computed(() => this.slices().length > 0 && this.totalCollected() > 0);

  private sliceColors = computed(() => {
    let navyIndex = 0;
    return this.slices().map((slice) =>
      slice.tone === 'red' ? 'var(--color-accent, #eb1f1a)' : NAVY_SHADES[navyIndex++ % NAVY_SHADES.length],
    );
  });

  legend = computed(() =>
    this.slices().map((slice, i) => ({
      label: slice.label,
      percent: slice.percent,
      color: this.sliceColors()[i],
    })),
  );

  segments = computed<DonutSegment[]>(() => {
    let cumulative = 0;
    return this.slices().map((slice, i) => {
      const dash = (slice.percent / 100) * CIRCUMFERENCE;
      const segment: DonutSegment = {
        label: slice.label,
        percent: slice.percent,
        color: this.sliceColors()[i],
        dashArray: `${dash} ${CIRCUMFERENCE - dash}`,
        dashOffset: -cumulative,
      };
      cumulative += dash;
      return segment;
    });
  });

  chartDescription = computed(() => {
    const parts = this.slices().map((slice) => `${slice.label} ${slice.percent}%`);
    return `Revenue share by payment method: ${parts.join(', ')}`;
  });
}
