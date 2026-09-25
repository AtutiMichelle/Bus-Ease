import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingDraftService } from '../../services/booking-draft.service';
import { AuthService } from '../../services/auth.service';
import { TravlerApiService } from '../../travler/travler-api.service';
import { travlerErrorMessage } from '../../travler/travler-errors';
import { BOOKING_HOLD_MINUTES } from '../../travler/travler.adapters';
import { TripPassenger } from '../../models/booking.model';
import { TripSummary } from '../../components/trip-summary/trip-summary';
import { isValidEmail, isValidIdNumber, normalizeKenyanPhone } from '../../utils/validation';

type PassengerField = 'fullName' | 'idNumber';

@Component({
  imports: [RouterLink, FormsModule, TripSummary, DecimalPipe],
  selector: 'app-confirmation',
  styleUrl: './confirmation.css',
  templateUrl: './confirmation.html',
})
export class Confirmation {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 2;
  readonly holdMinutes = BOOKING_HOLD_MINUTES;

  private bookingDraft = inject(BookingDraftService);
  private authService = inject(AuthService);
  private travler = inject(TravlerApiService);
  private router = inject(Router);

  draft = this.bookingDraft.current;

  passengers = signal<TripPassenger[]>([]);
  contactEmail = signal('');
  contactPhone = signal('');
  expandedRows = signal<Set<number>>(new Set());
  /** Field errors only show after the first submit attempt. */
  submitted = signal(false);
  submitting = signal(false);
  errorMessage = signal('');

  totalPrice = computed(() => this.passengers().reduce((sum, p) => sum + p.price, 0));
  completedCount = computed(() => this.passengers().filter((p) => this.isPassengerComplete(p)).length);

  backQueryParams = computed(() => {
    const trip = this.draft()?.trip;
    return trip
      ? {
          origin: trip.from,
          destination: trip.to,
          originId: trip.fromCityId,
          destinationId: trip.toCityId,
          journeyDate: trip.date,
          busId: trip.id,
        }
      : {};
  });

  emailError = computed(() => {
    const email = this.contactEmail().trim();
    if (!email) {
      return 'Enter an email address for the ticket.';
    }
    return isValidEmail(email) ? '' : 'Enter a valid email address.';
  });

  phoneError = computed(() => {
    const phone = this.contactPhone().trim();
    if (!phone) {
      return 'Enter a phone number.';
    }
    return normalizeKenyanPhone(phone) ? '' : 'Enter a Kenyan mobile number, e.g. 0712 345 678.';
  });

  canSubmit = computed(
    () =>
      this.passengers().length > 0 &&
      this.passengers().every((p) => this.isPassengerComplete(p)) &&
      !this.emailError() &&
      !this.phoneError(),
  );

  constructor() {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    const previous = new Map((draft.passengers ?? []).map((p) => [p.seatName, p]));
    this.passengers.set(
      draft.seats.map((seat) => ({
        seatName: seat.name,
        seatType: seat.type,
        fullName: previous.get(seat.name)?.fullName ?? '',
        idNumber: previous.get(seat.name)?.idNumber ?? '',
        price: seat.price,
      })),
    );
    this.expandedRows.set(new Set(draft.seats.map((_, i) => i)));

    const user = this.authService.user();
    this.contactEmail.set(draft.contact?.email ?? user?.email ?? '');
    this.contactPhone.set(draft.contact?.phone ?? (user?.user_metadata?.['phone'] as string | undefined) ?? '');
  }

  nameError(p: TripPassenger): string {
    return p.fullName.trim().length >= 2 ? '' : 'Enter the passenger’s full name.';
  }

  idError(p: TripPassenger): string {
    if (!p.idNumber.trim()) {
      return 'Enter an ID or passport number.';
    }
    return isValidIdNumber(p.idNumber) ? '' : 'Use 5 to 20 letters or numbers, no spaces.';
  }

  isPassengerComplete(p: TripPassenger): boolean {
    return !this.nameError(p) && !this.idError(p);
  }

  toggleExpand(index: number): void {
    this.expandedRows.update((rows) => {
      const next = new Set(rows);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  updatePassenger(index: number, field: PassengerField, value: string): void {
    this.passengers.update((list) => list.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  async confirmBooking(): Promise<void> {
    const draft = this.draft();
    this.submitted.set(true);
    if (!draft || this.submitting()) {
      return;
    }
    if (!this.canSubmit()) {
      // Open any passenger with a problem so the error is visible.
      this.expandedRows.update((rows) => {
        const next = new Set(rows);
        this.passengers().forEach((p, i) => !this.isPassengerComplete(p) && next.add(i));
        return next;
      });
      return;
    }

    const phone = normalizeKenyanPhone(this.contactPhone()) ?? '';
    const contact = { email: this.contactEmail().trim(), phone };
    const passengers = this.passengers().map((p) => ({ ...p, fullName: p.fullName.trim(), idNumber: p.idNumber.trim() }));

    this.errorMessage.set('');
    this.submitting.set(true);
    try {
      const hold = await this.travler.createBooking({
        trip: draft.trip,
        boardingPointId: draft.boarding.id,
        droppingPointId: draft.dropping.id,
        passengers,
        contact,
        totalAmount: this.totalPrice(),
      });
      this.bookingDraft.update({ passengers, contact, hold, paymentReference: undefined, ticketNumber: undefined });
      this.router.navigate(['/payment'], {
        queryParams: { busId: draft.trip.id, seats: draft.seats.map((s) => s.name).join(',') },
      });
    } catch (error) {
      this.errorMessage.set(travlerErrorMessage(error, "We couldn't reserve your seats. Please try again."));
    } finally {
      this.submitting.set(false);
    }
  }
}
