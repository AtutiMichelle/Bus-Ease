import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingDraftService } from '../../services/booking-draft.service';
import { TravlerApiService } from '../../travler/travler-api.service';
import { TravlerApiError, travlerErrorMessage } from '../../travler/travler-errors';
import { BOOKING_HOLD_MINUTES } from '../../travler/travler.adapters';
import { TripSummary } from '../../components/trip-summary/trip-summary';
import { environment } from '../../../environment';
import { normalizeKenyanPhone } from '../../utils/validation';

type Phase = 'ready' | 'starting' | 'awaiting' | 'rejected' | 'timeout' | 'error' | 'expired';

/** How often, and for how long, to ask whether the M-Pesa PIN was entered. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;

@Component({
  imports: [RouterLink, FormsModule, TripSummary, DecimalPipe],
  selector: 'app-payment',
  styleUrl: './payment.css',
  templateUrl: './payment.html',
})
export class Payment {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 3;
  readonly holdMinutes = BOOKING_HOLD_MINUTES;
  readonly mpesaLogo = environment.assets.paymentLogos.mpesa;

  private bookingDraft = inject(BookingDraftService);
  private travler = inject(TravlerApiService);
  private router = inject(Router);

  draft = this.bookingDraft.current;
  hold = computed(() => this.draft()?.hold);

  phase = signal<Phase>('ready');
  errorMessage = signal('');
  phone = signal('');
  /** Set once the user tries to pay, so the phone error only shows then. */
  triedPay = signal(false);

  private now = signal(Date.now());
  private countdownHandle?: ReturnType<typeof setInterval>;
  private pollHandle?: ReturnType<typeof setTimeout>;
  /** Bumped on every new payment attempt, so a late poll from an old one is ignored. */
  private attempt = 0;
  private destroyed = false;

  remainingSeconds = computed(() => {
    const hold = this.hold();
    if (!hold) {
      return 0;
    }
    return Math.max(0, Math.floor((new Date(hold.heldUntil).getTime() - this.now()) / 1000));
  });

  remainingLabel = computed(() => {
    const total = this.remainingSeconds();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  totalPrice = computed(() => this.hold()?.totalAmount ?? 0);
  normalizedPhone = computed(() => normalizeKenyanPhone(this.phone()));
  phoneError = computed(() => (this.normalizedPhone() ? '' : 'Enter a Safaricom number, e.g. 0712 345 678.'));
  busy = computed(() => this.phase() === 'starting' || this.phase() === 'awaiting');

  backQueryParams = computed(() => {
    const d = this.draft();
    return d ? { busId: d.trip.id, seats: d.seats.map((s) => s.name).join(',') } : {};
  });

  ticketQueryParams = computed(() => {
    const d = this.draft();
    return d
      ? {
          ticket: d.ticketNumber || null,
          reference: d.hold?.reference ?? null,
          busId: d.trip.id,
          seats: d.seats.map((s) => s.name).join(','),
        }
      : {};
  });

  constructor() {
    const draft = this.draft();
    const contactPhone = draft?.contact?.phone;
    // Show the contact number the way people write it locally: 07XX...
    this.phone.set(contactPhone ? `0${contactPhone.slice(3)}` : '');

    if (draft?.hold && !draft.ticketNumber) {
      this.startCountdown();
    }

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopCountdown();
      this.stopPolling();
    });
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.tick();
    this.countdownHandle = setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    this.now.set(Date.now());
    // A payment already in flight is left to finish: the PIN may have been
    // entered just before the hold ran out.
    if (this.remainingSeconds() <= 0 && !this.busy()) {
      this.phase.set('expired');
      this.stopCountdown();
    }
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = undefined;
    }
  }

  private stopPolling(): void {
    if (this.pollHandle) {
      clearTimeout(this.pollHandle);
      this.pollHandle = undefined;
    }
  }

  /** The hold has lapsed, so the seats may already be someone else's.
   * Keep the trip (the seat map needs it) but drop the dead booking. */
  backToSeatSelection(): void {
    const trip = this.draft()?.trip;
    this.bookingDraft.clear();
    if (!trip) {
      this.router.navigate(['/']);
      return;
    }
    this.router.navigate(['/results'], {
      queryParams: {
        origin: trip.from,
        destination: trip.to,
        originId: trip.fromCityId,
        destinationId: trip.toCityId,
        journeyDate: trip.date,
        busId: trip.id,
      },
    });
  }

  async pay(): Promise<void> {
    this.triedPay.set(true);
    const hold = this.hold();
    const phone = this.normalizedPhone();
    if (!hold || !phone || this.busy() || this.phase() === 'expired') {
      return;
    }
    if (this.remainingSeconds() <= 0) {
      this.phase.set('expired');
      return;
    }

    const attempt = ++this.attempt;
    this.stopPolling();
    this.errorMessage.set('');
    this.phase.set('starting');
    try {
      const payment = await this.travler.startMpesaPayment(hold.reference, phone, hold.totalAmount);
      if (attempt !== this.attempt || this.destroyed) {
        return;
      }
      this.bookingDraft.update({ paymentReference: payment.reference });
      this.phase.set('awaiting');
      this.schedulePoll(attempt, payment.reference, Date.now() + POLL_TIMEOUT_MS);
    } catch (error) {
      if (attempt !== this.attempt) {
        return;
      }
      this.failWith(error, "We couldn't start the M-Pesa payment. Please try again.");
    }
  }

  private schedulePoll(attempt: number, reference: string, deadline: number): void {
    this.pollHandle = setTimeout(() => this.poll(attempt, reference, deadline), POLL_INTERVAL_MS);
  }

  private async poll(attempt: number, reference: string, deadline: number): Promise<void> {
    try {
      const status = await this.travler.checkMpesaPayment(reference);
      if (attempt !== this.attempt || this.destroyed) {
        return;
      }
      if (status.state === 'success') {
        this.succeed(status.ticketNumber ?? '', reference);
        return;
      }
      if (status.state === 'rejected') {
        this.errorMessage.set('The M-Pesa payment was declined or cancelled. Please try again.');
        this.phase.set('rejected');
        return;
      }
    } catch (error) {
      if (attempt !== this.attempt || this.destroyed) {
        return;
      }
      // A clear answer from the API ends the wait; a dropped connection
      // doesn't, the next check may well get through.
      if (error instanceof TravlerApiError && error.code) {
        this.failWith(error, "We couldn't confirm your payment.");
        return;
      }
    }

    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      this.phase.set(this.remainingSeconds() <= 0 ? 'expired' : 'timeout');
      return;
    }
    this.schedulePoll(attempt, reference, deadline);
  }

  private failWith(error: unknown, fallback: string): void {
    this.errorMessage.set(travlerErrorMessage(error, fallback));
    const rejected = error instanceof TravlerApiError && error.code === 'PAYMENT_REJECTED';
    this.phase.set(rejected ? 'rejected' : 'error');
    if (this.remainingSeconds() <= 0) {
      this.phase.set('expired');
    }
  }

  private succeed(ticketNumber: string, paymentReference: string): void {
    this.stopCountdown();
    this.stopPolling();
    this.bookingDraft.update({ ticketNumber, paymentReference });
    this.router.navigate(['/ticket'], { queryParams: this.ticketQueryParams() });
  }

  /** After a timeout the PIN may still have gone through late, so check
   * once more before sending a second prompt. */
  async checkAgain(): Promise<void> {
    const reference = this.draft()?.paymentReference;
    if (!reference || this.busy()) {
      return;
    }
    const attempt = ++this.attempt;
    this.errorMessage.set('');
    this.phase.set('awaiting');
    // One short extra window rather than the full 90 seconds.
    this.schedulePoll(attempt, reference, Date.now() + POLL_INTERVAL_MS * 3);
  }
}
