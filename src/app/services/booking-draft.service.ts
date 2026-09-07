import { Injectable, signal } from '@angular/core';
import { Bus } from '../models/bus.model';
import { PassengerInput } from '../models/booking.model';

export interface BookingDraft {
  bus: Bus;
  passengers: PassengerInput[];
  boardingPoint: string;
  dropoffPoint: string;
}


@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  private draft = signal<BookingDraft | undefined>(undefined);
  readonly current = this.draft.asReadonly();

  set(draft: BookingDraft): void {
    this.draft.set(draft);
  }

  clear(): void {
    this.draft.set(undefined);
  }
}
