import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusService } from '../../services/bus.service';
import { BookingService } from '../../services/booking.service';
import { Bus } from '../../models/bus.model';
import { PassengerInput } from '../../models/booking.model';
import { FormsModule } from '@angular/forms';

type Phase = 'loading' | 'details' | 'submitting' | 'confirmed' | 'error';

@Component({
  imports: [RouterLink, FormsModule],
  selector: 'app-confirmation',
  styleUrl: './confirmation.css',
  templateUrl: './confirmation.html',
})
export class Confirmation {
  bus = signal<Bus | undefined>(undefined);
  passengers = signal<PassengerInput[]>([]);
  phase = signal<Phase>('loading');
  errorMessage = signal('');
  bookingReference = signal('');

  totalPrice = computed(() => (this.bus()?.price ?? 0) * this.passengers().length);
  seatList = computed(() => this.passengers().map((p) => p.seatNumber).join(', '));

  get canSubmit(): boolean {
    return (
      this.passengers().length > 0 &&
      this.passengers().every((p) => p.fullName.trim().length > 0 && p.mobile.trim().length > 0)
    );
  }

  private busId: string;
  private seatNumbers: string[];

  constructor(
    private route: ActivatedRoute,
    private busService: BusService,
    private bookingService: BookingService,
  ) {
    const params = this.route.snapshot.queryParamMap;
    this.busId = params.get('busId') ?? '';
    const seatsParam = params.get('seats') ?? '';
    this.seatNumbers = seatsParam ? seatsParam.split(',') : [];
    this.load();
  }

  private async load(): Promise<void> {
    if (!this.busId || this.seatNumbers.length === 0) {
      this.errorMessage.set('Missing booking details.');
      this.phase.set('error');
      return;
    }
    try {
      const bus = await this.busService.getById(this.busId);
      if (!bus) {
        this.errorMessage.set("We couldn't find that bus.");
        this.phase.set('error');
        return;
      }
      this.bus.set(bus);
      this.passengers.set(
        this.seatNumbers.map((seatNumber) => ({ seatNumber, fullName: '', mobile: '', age: undefined, gender: undefined })),
      );
      this.phase.set('details');
    } catch {
      this.errorMessage.set('Could not load your trip. Please try again.');
      this.phase.set('error');
    }
  }

  updatePassenger(index: number, field: 'fullName' | 'mobile' | 'gender', value: string): void {
    this.passengers.update((list) => list.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  updatePassengerAge(index: number, value: string): void {
    const age = value.trim() ? Number(value) : undefined;
    this.passengers.update((list) => list.map((p, i) => (i === index ? { ...p, age } : p)));
  }

  async confirmBooking(): Promise<void> {
    const bus = this.bus();
    if (!bus || !this.canSubmit) {
      return;
    }
    this.errorMessage.set('');
    this.phase.set('submitting');
    try {
      const reference = await this.bookingService.createBooking(bus, this.passengers());
      this.bookingReference.set(reference);
      this.phase.set('confirmed');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not complete your booking. Please try again.');
      this.phase.set('details');
    }
  }

  print(): void {
    window.print();
  }
}
