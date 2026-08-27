import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { SavedBooking } from '../../models/booking.model';

@Component({
  imports: [RouterLink],
  selector: 'app-my-bookings',
  styleUrl: './my-bookings.css',
  templateUrl: './my-bookings.html',
})
export class MyBookings {
  bookings = signal<SavedBooking[]>([]);
  loading = signal(true);
  errorMessage = signal('');

  constructor(private bookingService: BookingService) {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      this.bookings.set(await this.bookingService.getMyBookings());
    } catch {
      this.errorMessage.set('Could not load your bookings. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
