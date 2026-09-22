import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminTripsService } from '../../../services/admin-trips.service';
import {
  AMENITY_OPTIONS,
  AdminOperator,
  AdminRoute,
  AdminTrip,
  BUS_TYPE_OPTIONS,
  BusType,
  SEAT_CLASS_NAMES,
  TripCreateValue,
  TripUpdateValue,
} from '../../../models/admin-fleet.model';
import { BusClassOption } from '../../../models/bus.model';

interface ClassField {
  className: BusClassOption['className'];
  enabled: boolean;
  price: number | null;
}

/** departure_time/arrival_time come back as "YYYY-MM-DDTHH:mm:ss" (no
 * timezone, Nairobi wall-clock already); a datetime-local input wants
 * exactly "YYYY-MM-DDTHH:mm". */
function toDatetimeLocal(value: string): string {
  return value.slice(0, 16);
}

/** Create/edit modal for one trip. A null `trip` input means create, which
 * additionally asks for the seat layout (rows + classes) since that can
 * only be set once (see the file header in
 * supabase/sql/2026-09-22-admin-routes-trips.sql). */
@Component({
  imports: [FormsModule, DecimalPipe],
  selector: 'app-trip-form',
  styleUrl: './trip-form.css',
  templateUrl: './trip-form.html',
})
export class TripForm implements OnInit {
  private tripsService = inject(AdminTripsService);

  trip = input<AdminTrip | null>(null);
  routes = input.required<AdminRoute[]>();
  operators = input.required<AdminOperator[]>();
  saved = output<void>();
  closed = output<void>();

  readonly busTypes = BUS_TYPE_OPTIONS;
  readonly amenityOptions = AMENITY_OPTIONS;

  routeId = signal('');
  operatorMode = signal<'existing' | 'new'>('existing');
  operatorId = signal('');
  newOperatorName = signal('');
  busType = signal<BusType>('Standard');
  departureTime = signal('');
  arrivalTime = signal('');
  basePrice = signal<number | null>(null);
  amenities = signal<string[]>([]);

  rows = signal<number | null>(null);
  classFields = signal<ClassField[]>(
    SEAT_CLASS_NAMES.map((className) => ({ className, enabled: className === 'Normal', price: null })),
  );

  submitting = signal(false);
  error = signal('');

  get isEdit(): boolean {
    return this.trip() !== null;
  }

  totalSeatsPreview = computed(() => {
    const rows = this.rows();
    return rows && rows > 0 ? Math.max(rows - 1, 0) * 4 + 5 : 0;
  });

  ngOnInit(): void {
    const existing = this.trip();
    if (!this.routeId() && this.routes().length > 0 && !existing) {
      this.routeId.set(this.routes()[0].id);
    }
    if (!existing) {
      return;
    }
    this.routeId.set(existing.routeId);
    this.operatorMode.set('existing');
    this.operatorId.set(existing.operatorId);
    this.busType.set(existing.busType);
    this.departureTime.set(toDatetimeLocal(existing.departureTime));
    this.arrivalTime.set(toDatetimeLocal(existing.arrivalTime));
    this.basePrice.set(existing.basePrice);
    this.amenities.set([...existing.amenities]);
  }

  toggleAmenity(amenity: string): void {
    this.amenities.update((list) => (list.includes(amenity) ? list.filter((a) => a !== amenity) : [...list, amenity]));
  }

  toggleClass(className: BusClassOption['className']): void {
    this.classFields.update((fields) =>
      fields.map((field) => (field.className === className ? { ...field, enabled: !field.enabled } : field)),
    );
  }

  setClassPrice(className: BusClassOption['className'], price: number | null): void {
    this.classFields.update((fields) => fields.map((field) => (field.className === className ? { ...field, price } : field)));
  }

  get enabledClasses(): ClassField[] {
    return this.classFields().filter((field) => field.enabled);
  }

  get canSubmit(): boolean {
    const hasSchedule =
      this.routeId().length > 0 &&
      this.departureTime().length > 0 &&
      this.arrivalTime().length > 0 &&
      this.arrivalTime() > this.departureTime() &&
      (this.basePrice() ?? 0) > 0 &&
      !this.submitting();
    const hasOperator = this.operatorMode() === 'existing' ? this.operatorId().length > 0 : this.newOperatorName().trim().length > 0;
    if (!hasSchedule || !hasOperator) {
      return false;
    }
    if (this.isEdit) {
      return true;
    }
    const rows = this.rows();
    const classesValid = this.enabledClasses.length > 0 && this.enabledClasses.every((c) => (c.price ?? 0) > 0);
    return !!rows && rows > 0 && rows <= 20 && classesValid;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.submitting()) {
      this.closed.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.submitting()) {
      this.closed.emit();
    }
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    const base = {
      routeId: this.routeId(),
      operatorId: this.operatorMode() === 'existing' ? this.operatorId() : null,
      newOperatorName: this.operatorMode() === 'new' ? this.newOperatorName().trim() : null,
      busType: this.busType(),
      departureTime: this.departureTime(),
      arrivalTime: this.arrivalTime(),
      basePrice: this.basePrice()!,
      amenities: this.amenities(),
    };
    try {
      const existing = this.trip();
      if (existing) {
        await this.tripsService.update(existing.id, base as TripUpdateValue);
      } else {
        const value: TripCreateValue = {
          ...base,
          rows: this.rows()!,
          classes: this.enabledClasses.map((c) => ({ className: c.className, price: c.price! })),
        };
        await this.tripsService.create(value);
      }
      this.saved.emit();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not save the trip. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
