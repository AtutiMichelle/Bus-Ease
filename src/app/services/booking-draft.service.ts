import { Injectable, signal } from '@angular/core';
import { BookingHold, StopPoint, Trip } from '../models/trip.model';
import { BookingContact, SelectedSeat, TripPassenger } from '../models/booking.model';

/** Everything the customer has chosen so far, from the seat map through to
 * the paid ticket. Each step adds its part. */
export interface BookingDraft {
  trip: Trip;
  seats: SelectedSeat[];
  boarding: StopPoint;
  dropping: StopPoint;
  passengers?: TripPassenger[];
  contact?: BookingContact;
  hold?: BookingHold;
  paymentReference?: string;
  ticketNumber?: string;
}

const STORAGE_KEY = 'busease_booking_draft';

function readStored(): BookingDraft | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BookingDraft) : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(draft: BookingDraft | undefined): void {
  try {
    if (draft) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage blocked (private mode etc.): the draft still lives in memory
    // for this visit, it just won't survive a reload.
  }
}

/** Kept per tab (sessionStorage) so a reload mid-booking doesn't lose the
 * trip, since the booking API has no "get trip by id" to rebuild it from. */
@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  private draft = signal<BookingDraft | undefined>(readStored());
  readonly current = this.draft.asReadonly();

  set(draft: BookingDraft): void {
    this.draft.set(draft);
    writeStored(draft);
  }

  update(patch: Partial<BookingDraft>): void {
    const current = this.draft();
    if (!current) {
      return;
    }
    this.set({ ...current, ...patch });
  }

  clear(): void {
    this.draft.set(undefined);
    writeStored(undefined);
  }
}
