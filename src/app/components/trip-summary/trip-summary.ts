import { Component, computed, input } from '@angular/core';
import { Bus } from '../../models/bus.model';
import { PassengerInput } from '../../models/booking.model';

@Component({
  selector: 'app-trip-summary',
  standalone: true,
  styleUrl: './trip-summary.css',
  templateUrl: './trip-summary.html',
})
export class TripSummary {
  bus = input.required<Bus>();
  passengers = input<PassengerInput[]>([]);
  boardingPoint = input('');
  dropoffPoint = input('');

  totalPrice = computed(() => {
    const fallback = this.bus()?.price ?? 0;
    return this.passengers().reduce((sum, p) => sum + (p.price ?? fallback), 0);
  });
}
