import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
import { getGuestToken } from '../../utils/guest-token';

type PaymentMethod = 'mpesa' | 'airtel' | 'wallet';
type Phase = 'reserving' | 'ready' | 'processing' | 'error' | 'missing' | 'expired';

/** How long the simulated gateway prompt (STK push / card auth) takes before
 * the booking actually gets created. There's no real payment gateway wired
 * up yet, so this just stands in for that round trip. */
const GATEWAY_DELAY_MS = 1500;

/** How long a seat hold lasts once someone reaches this page. */
const HOLD_MINUTES = 15;

@Component({
  imports: [RouterLink, FormsModule, TripSummary, DecimalPipe],
  selector: 'app-payment',
  styleUrl: './payment.css',
  templateUrl: './payment.html',
})
export class Payment {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 3;
  readonly holdMinutes = HOLD_MINUTES;

  bus = signal<Bus | undefined>(undefined);
  passengers = signal<PassengerInput[]>([]);
  boardingPoint = signal('');
  dropoffPoint = signal('');

  phase = signal<Phase>('missing');
  errorMessage = signal('');

  method = signal<PaymentMethod>('mpesa');
  phone = signal('');

  readonly paymentLogos = environment.assets.paymentLogos;

  /** Seat hold expiry, and a ticking clock to count down to it. */
  reservedUntil = signal<Date | null>(null);
  private now = signal(Date.now());
  private countdownHandle?: ReturnType<typeof setInterval>;
  private heldBy = '';

  remainingSeconds = computed(() => {
    const until = this.reservedUntil();
    if (!until) {
      return 0;
    }
    return Math.max(0, Math.floor((until.getTime() - this.now()) / 1000));
  });

  remainingLabel = computed(() => {
    const total = this.remainingSeconds();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

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
    this.heldBy = this.authService.user()?.id ?? getGuestToken();
    this.phase.set('reserving');
    this.reserve();

    inject(DestroyRef).onDestroy(() => this.stopCountdown());
  }

  private async reserve(): Promise<void> {
    const bus = this.bus();
    if (!bus) {
      return;
    }
    this.errorMessage.set('');
    try {
      const reservedUntil = await this.bookingService.reserveSeats(
        bus.id,
        this.passengers().map((p) => p.seatNumber),
        this.heldBy,
        HOLD_MINUTES,
      );
      this.reservedUntil.set(new Date(reservedUntil));
      this.startCountdown();
      this.phase.set('ready');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'One or more of your seats were just taken. Please go back and reselect.',
      );
      this.phase.set('error');
    }
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.now.set(Date.now());
    this.countdownHandle = setInterval(() => {
      this.now.set(Date.now());
      if (this.remainingSeconds() <= 0 && this.phase() === 'ready') {
        this.phase.set('expired');
        this.stopCountdown();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = undefined;
    }
  }

  selectMethod(method: PaymentMethod): void {
    this.method.set(method);
    this.errorMessage.set('');
  }

  /** The expired seats are no longer held for this booking (someone else
   * could claim them any moment), so there's nothing left to do with the
   * old draft — clear it and send the user back to pick fresh seats. */
  backToSeatSelection(): void {
    const bus = this.bus();
    this.bookingDraft.clear();
    if (!bus) {
      this.router.navigate(['/']);
      return;
    }
    this.router.navigate(['/results'], {
      queryParams: { origin: bus.from, destination: bus.to, journeyDate: bus.date, busId: bus.id },
    });
  }

  /** The retry link can follow either a failed hold attempt (nothing reserved
   * yet) or a failed payment (hold already in place) — re-run whichever one
   * actually needs redoing. */
  retry(): void {
    if (!this.reservedUntil()) {
      this.phase.set('reserving');
      this.reserve();
      return;
    }
    this.pay();
  }

  async pay(): Promise<void> {
    const bus = this.bus();
    if (!bus || !this.canPay() || this.phase() !== 'ready') {
      return;
    }
    this.errorMessage.set('');
    this.phase.set('processing');
    try {
      await new Promise((resolve) => setTimeout(resolve, GATEWAY_DELAY_MS));
      const reference = await this.bookingService.confirmBooking(bus, this.passengers(), this.heldBy);
      this.stopCountdown();
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
