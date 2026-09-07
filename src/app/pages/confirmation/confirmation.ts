import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BusService } from '../../services/bus.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { Bus } from '../../models/bus.model';
import { PassengerInput } from '../../models/booking.model';
import { FormsModule } from '@angular/forms';
import { TripSummary } from '../../components/trip-summary/trip-summary';

type Phase = 'loading' | 'details' | 'error';
type DeliveryMode = 'all' | 'select';
type DeliveryMethod = 'whatsapp' | 'sms' | 'email';

@Component({
  imports: [RouterLink, FormsModule, TripSummary],
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
  expandedRows = signal<Set<number>>(new Set());
  boardingPoint = signal('');
  dropoffPoint = signal('');
  deliveryMode = signal<DeliveryMode>('all');
  deliveryMethod = signal<DeliveryMethod>('whatsapp');
  deliverySelectedSeats = signal<Set<string>>(new Set());

  totalPrice = computed(() => this.passengers().reduce((sum, p) => sum + (p.price ?? 0), 0));
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
    private bookingDraft: BookingDraftService,
    private router: Router,
  ) {
    const params = this.route.snapshot.queryParamMap;
    this.busId = params.get('busId') ?? '';
    const seatsParam = params.get('seats') ?? '';
    this.seatNumbers = seatsParam ? seatsParam.split(',') : [];
    this.boardingPoint.set(params.get('boardingPoint') ?? '');
    this.dropoffPoint.set(params.get('dropoffPoint') ?? '');
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
      this.boardingPoint.update((value) => value || bus.from);
      this.dropoffPoint.update((value) => value || bus.to);
      const seats = await this.busService.getSeats(this.busId);
      const priceByNumber = new Map(seats.map((s) => [s.number, s.price ?? bus.price]));
      const passengers = this.seatNumbers.map((seatNumber) => ({
        seatNumber,
        fullName: '',
        mobile: '',
        age: undefined,
        gender: undefined,
        price: priceByNumber.get(seatNumber) ?? bus.price,
      }));
      this.passengers.set(passengers);
      this.deliverySelectedSeats.set(new Set());
      if (passengers.length > 1) {
        this.expandedRows.set(new Set(passengers.map((_, i) => i)));
      } else {
        this.expandedRows.set(new Set([0]));
      }
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

  confirmBooking(): void {
    const bus = this.bus();
    if (!bus || !this.canSubmit) {
      return;
    }
    this.errorMessage.set('');
    this.bookingDraft.set({
      bus,
      passengers: this.passengers(),
      boardingPoint: this.boardingPoint(),
      dropoffPoint: this.dropoffPoint(),
    });
    this.router.navigate(['/payment'], {
      queryParams: { busId: bus.id, seats: this.seatNumbers.join(',') },
    });
  }
}
