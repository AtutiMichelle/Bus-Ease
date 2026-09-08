import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingDraftService } from '../../services/booking-draft.service';
import { BookingService } from '../../services/booking.service';
import { AuthService } from '../../services/auth.service';
import { Bus } from '../../models/bus.model';
import { PassengerInput } from '../../models/booking.model';
import { TripSummary } from '../../components/trip-summary/trip-summary';
import { environment } from '../../../environment';

type PaymentMethod = 'mpesa' | 'airtel' | 'wallet';
type Phase = 'ready' | 'processing' | 'error' | 'missing';

/** How long the simulated gateway prompt (STK push / card auth) takes before
 * the booking actually gets created. There's no real payment gateway wired
 * up yet, so this just stands in for that round trip. */
const GATEWAY_DELAY_MS = 1500;

@Component({
  imports: [RouterLink, FormsModule, TripSummary, DecimalPipe],
  selector: 'app-payment',
  styleUrl: './payment.css',
  templateUrl: './payment.html',
})
export class Payment {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 3;

  bus = signal<Bus | undefined>(undefined);
  passengers = signal<PassengerInput[]>([]);
  boardingPoint = signal('');
  dropoffPoint = signal('');

  phase = signal<Phase>('missing');
  errorMessage = signal('');

  method = signal<PaymentMethod>('mpesa');
  phone = signal('');

  readonly paymentLogos = environment.assets.paymentLogos;

  totalPrice = computed(() => {
    const fallback = this.bus()?.price ?? 0;
    return this.passengers().reduce((sum, p) => sum + (p.price ?? fallback), 0);
  });

  backQueryParams = computed(() => {
    const b = this.bus();
    return b ? { busId: b.id, seats: this.passengers().map((p) => p.seatNumber).join(',') } : {};
  });

  canPay = computed(() => {
    if (this.method() === 'wallet') {
      return true;
    }
    return /^\d{9}$/.test(this.phone().trim());
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bookingDraft: BookingDraftService,
    private bookingService: BookingService,
    private authService: AuthService,
  ) {
    const draft = this.bookingDraft.current();
    if (!draft) {
      this.phase.set('missing');
      return;
    }
    this.bus.set(draft.bus);
    this.passengers.set(draft.passengers);
    this.boardingPoint.set(draft.boardingPoint);
    this.dropoffPoint.set(draft.dropoffPoint);
    this.phase.set('ready');
  }

  selectMethod(method: PaymentMethod): void {
    this.method.set(method);
    this.errorMessage.set('');
  }

  async pay(): Promise<void> {
    const bus = this.bus();
    if (!bus || !this.canPay() || this.phase() === 'processing') {
      return;
    }
    this.errorMessage.set('');
    this.phase.set('processing');
    try {
      await new Promise((resolve) => setTimeout(resolve, GATEWAY_DELAY_MS));
      const reference = this.authService.user()
        ? await this.bookingService.createBooking(bus, this.passengers())
        : await this.bookingService.createGuestBooking(bus, this.passengers()[0]);
      this.bookingDraft.clear();
      this.router.navigate(['/ticket'], {
        queryParams: {
          reference,
          busId: bus.id,
          seats: this.passengers().map((p) => p.seatNumber).join(','),
        },
      });
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'We could not process your payment. Please try again.',
      );
      this.phase.set('error');
    }
  }
}
