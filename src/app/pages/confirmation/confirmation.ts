import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusService } from '../../services/bus.service';
import { BookingService } from '../../services/booking.service';
import { Bus } from '../../models/bus.model';
import { PassengerInput } from '../../models/booking.model';
import { FormsModule } from '@angular/forms';

type Phase = 'loading' | 'details' | 'submitting' | 'confirmed' | 'error';
type DeliveryMode = 'all' | 'select';
type DeliveryMethod = 'whatsapp' | 'sms' | 'email';

@Component({
  imports: [RouterLink, FormsModule],
  selector: 'app-confirmation',
  styleUrl: './confirmation.css',
  templateUrl: './confirmation.html',
})
export class Confirmation {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 2;

  bus = signal<Bus | undefined>(undefined);
  passengers = signal<PassengerInput[]>([]);
  phase = signal<Phase>('loading');
  errorMessage = signal('');
  bookingReference = signal('');
  expandedIndex = signal<number>(0);
  deliveryMode = signal<DeliveryMode>('all');
  deliveryMethod = signal<DeliveryMethod>('whatsapp');
  deliverySelectedSeats = signal<Set<string>>(new Set());

  totalPrice = computed(() => (this.bus()?.price ?? 0) * this.passengers().length);
  seatList = computed(() => this.passengers().map((p) => p.seatNumber).join(', '));
  completedCount = computed(() => this.passengers().filter((p) => this.isPassengerComplete(p)).length);
  backQueryParams = computed(() => {
    const b = this.bus();
    return b ? { origin: b.from, destination: b.to, journeyDate: b.date, busId: b.id } : {};
  });

  deliveryRecipientCount = computed(() => {
    if (this.deliveryMode() === 'all') {
      return this.passengers().length;
    }
    return this.deliverySelectedSeats().size;
  });

  deliveryNote = computed(() => {
    const methodLabel = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'email' }[this.deliveryMethod()];
    const count = this.deliveryRecipientCount();
    if (this.deliveryMode() === 'all') {
      return `All ${count} passenger${count === 1 ? '' : 's'} will get their ticket via ${methodLabel}.`;
    }
    return count === 0
      ? 'Select at least one passenger to deliver a ticket to.'
      : `${count} selected passenger${count === 1 ? '' : 's'} will get their ticket via ${methodLabel}.`;
  });

  isPassengerComplete(p: PassengerInput): boolean {
    return p.fullName.trim().length > 0 && p.mobile.trim().length > 0;
  }

  toggleExpand(index: number): void {
    if (this.expandedIndex() !== index) {
      this.expandedIndex.set(index);
    }
  }

  setDeliveryMode(mode: DeliveryMode): void {
    this.deliveryMode.set(mode);
  }

  setDeliveryMethod(method: DeliveryMethod): void {
    this.deliveryMethod.set(method);
  }

  toggleDeliverySeat(seatNumber: string): void {
    this.deliverySelectedSeats.update((seats) => {
      const next = new Set(seats);
      if (next.has(seatNumber)) {
        next.delete(seatNumber);
      } else {
        next.add(seatNumber);
      }
      return next;
    });
  }

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
      const passengers = this.seatNumbers.map((seatNumber) => ({
        seatNumber,
        fullName: '',
        mobile: '',
        age: undefined,
        gender: undefined,
      }));
      this.passengers.set(passengers);
      this.deliverySelectedSeats.set(new Set(passengers.map((p) => p.seatNumber)));
      const firstIncomplete = passengers.findIndex((p) => !this.isPassengerComplete(p));
      this.expandedIndex.set(firstIncomplete === -1 ? 0 : firstIncomplete);
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
