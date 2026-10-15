import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Trip } from '../../models/trip.model';
import { SelectedSeat } from '../../models/booking.model';
import { CityNamePipe } from '../../utils/city-name';

@Component({
  selector: 'app-trip-summary',
  standalone: true,
  imports: [DecimalPipe, CityNamePipe],
  styleUrl: './trip-summary.css',
  templateUrl: './trip-summary.html',
})
export class TripSummary {
  trip = input.required<Trip>();
  seats = input<SelectedSeat[]>([]);
  boardingPoint = input('');
  dropoffPoint = input('');

  /** Seat layout prices, the same figure the booking is sent with. */
  totalPrice = computed(() => this.seats().reduce((sum, seat) => sum + seat.price, 0));
}
