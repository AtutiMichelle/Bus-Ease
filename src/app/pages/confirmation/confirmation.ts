import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingDraftService } from '../../services/booking-draft.service';
import { AuthService } from '../../services/auth.service';
import { TRIP_PROVIDER } from '../../trips/trip-provider.token';
import { tripErrorMessage } from '../../trips/trip-errors';
import { TripPassenger, passengerName } from '../../models/booking.model';
import { TripSummary } from '../../components/trip-summary/trip-summary';
import { isValidEmail, isValidIdNumber, normalizeKenyanPhone } from '../../utils/validation';
import { VoiceStepsService } from '../../voice/voice-steps.service';
import { DetailsVoiceStep } from '../../voice/steps/details-step';

type PassengerField = 'firstName' | 'lastName' | 'gender' | 'age' | 'nationality' | 'idNumber';

/** Most travellers are Kenyan, so the field starts filled in. */
const DEFAULT_NATIONALITY = 'Kenyan';

/** Travler takes up to 50 characters per name and 40 for nationality. */
const MAX_NAME_LENGTH = 50;
const MAX_NATIONALITY_LENGTH = 40;

@Component({
  imports: [RouterLink, FormsModule, TripSummary, DecimalPipe],
  selector: 'app-confirmation',
  styleUrl: './confirmation.css',
  templateUrl: './confirmation.html',
})
export class Confirmation {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 2;

  private bookingDraft = inject(BookingDraftService);
  private authService = inject(AuthService);
  private tripProvider = inject(TRIP_PROVIDER);
  readonly holdMinutes = this.tripProvider.holdMinutes;
  private router = inject(Router);

  draft = this.bookingDraft.current;
  readonly passengerName = passengerName;

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
      draft.seats.map((seat) => {
        const before = previous.get(seat.name);
        return {
          seatId: seat.id,
          seatName: seat.name,
          seatType: seat.type,
          firstName: before?.firstName ?? '',
          lastName: before?.lastName ?? '',
          gender: before?.gender ?? '',
          age: before?.age ?? '',
          nationality: before?.nationality ?? DEFAULT_NATIONALITY,
          idNumber: before?.idNumber ?? '',
          price: seat.price,
        };
      }),
    );
    this.expandedRows.set(new Set(draft.seats.map((_, i) => i)));

    const user = this.authService.user();
    this.contactEmail.set(draft.contact?.email ?? user?.email ?? '');
    this.contactPhone.set(draft.contact?.phone ?? (user?.user_metadata?.['phone'] as string | undefined) ?? '');

    // The voice assistant hands this form over to the user.
    const leaveVoiceStep = inject(VoiceStepsService).enter(
      new DetailsVoiceStep({ passengerCount: () => this.passengers().length }),
    );
    inject(DestroyRef).onDestroy(leaveVoiceStep);
  }

  firstNameError(p: TripPassenger): string {
    return nameProblem(p.firstName, 'first name');
  }

  lastNameError(p: TripPassenger): string {
    return nameProblem(p.lastName, 'last name');
  }

  genderError(p: TripPassenger): string {
    return p.gender ? '' : 'Choose a gender.';
  }

  ageError(p: TripPassenger): string {
    const age = p.age.trim();
    if (!age) {
      return 'Enter the passenger’s age.';
    }
    return /^\d{1,3}$/.test(age) && Number(age) <= 120 ? '' : 'Enter the age in whole years.';
  }

  nationalityError(p: TripPassenger): string {
    const nationality = p.nationality.trim();
    if (!nationality) {
      return 'Enter a nationality.';
    }
    return nationality.length <= MAX_NATIONALITY_LENGTH ? '' : `Use ${MAX_NATIONALITY_LENGTH} characters or fewer.`;
  }

  idError(p: TripPassenger): string {
    if (!p.idNumber.trim()) {
      return 'Enter an ID or passport number.';
    }
    return isValidIdNumber(p.idNumber) ? '' : 'Use 5 to 20 letters or numbers, no spaces.';
  }

  isPassengerComplete(p: TripPassenger): boolean {
    return (
      !this.firstNameError(p) &&
      !this.lastNameError(p) &&
      !this.genderError(p) &&
      !this.ageError(p) &&
      !this.nationalityError(p) &&
      !this.idError(p)
    );
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
    const passengers = this.passengers().map((p) => ({
      ...p,
      firstName: p.firstName.trim(),
      lastName: p.lastName.trim(),
      age: p.age.trim(),
      nationality: p.nationality.trim(),
      idNumber: p.idNumber.trim(),
    }));

    this.errorMessage.set('');
    this.submitting.set(true);
    try {
      const hold = await this.tripProvider.createBooking({
        trip: draft.trip,
        boarding: draft.boarding,
        dropping: draft.dropping,
        passengers,
        contact,
        totalAmount: this.totalPrice(),
      });
      this.bookingDraft.update({ passengers, contact, hold, paymentReference: undefined, ticketNumber: undefined });
      this.router.navigate(['/payment'], {
        queryParams: { busId: draft.trip.id, seats: draft.seats.map((s) => s.name).join(',') },
      });
    } catch (error) {
      this.errorMessage.set(tripErrorMessage(error, "We couldn't reserve your seats. Please try again."));
    } finally {
      this.submitting.set(false);
    }
  }
}

function nameProblem(value: string, label: string): string {
  const name = value.trim();
  if (!name) {
    return `Enter the passenger’s ${label}.`;
  }
  return name.length <= MAX_NAME_LENGTH ? '' : `Use ${MAX_NAME_LENGTH} characters or fewer.`;
}
