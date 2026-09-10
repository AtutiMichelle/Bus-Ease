import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { BookingService } from '../../services/booking.service';
import { SavedBooking } from '../../models/booking.model';
import { AccountPreferencesService } from './account-preferences.service';
import { AccountBooking, BookingStatus, NotificationSettings } from './account.model';

type AccountTab = 'bookings' | 'profile' | 'settings';
type BookingFilter = 'all' | 'upcoming' | 'completed' | 'cancelled';

const FILTERS: { id: BookingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatBookingDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** Bus.departureTime is a display-formatted 12-hour string ("01:30 PM" or
 * "6:30 AM"), not a raw timestamp — parse it back out so same-day bookings
 * can tell whether their actual departure has already passed, not just
 * whether the calendar day has. */
function departureTimestamp(dateString: string, time: string): number {
  const date = new Date(`${dateString}T00:00:00`);
  const match = time.match(/(\d{1,2}):(\d{2})\D*([AaPp][Mm])/);
  if (match) {
    let hours = parseInt(match[1], 10) % 12;
    if (match[3].toUpperCase() === 'PM') {
      hours += 12;
    }
    date.setHours(hours, parseInt(match[2], 10), 0, 0);
  }
  return date.getTime();
}

/** The bookings table has no cancellation flag yet, so status can only be
 * inferred from whether the trip has already departed — every past booking
 * reads as "completed" until real cancellation tracking exists. */
function bookingStatus(dateString: string, time: string): BookingStatus {
  return departureTimestamp(dateString, time) >= Date.now() ? 'confirmed' : 'completed';
}

function toAccountBooking(saved: SavedBooking): AccountBooking {
  return {
    reference: saved.reference,
    from: saved.bus.from,
    to: saved.bus.to,
    date: saved.bus.date,
    time: saved.bus.departureTime,
    seats: saved.seats,
    fare: saved.total,
    status: bookingStatus(saved.bus.date, saved.bus.departureTime),
  };
}

@Component({
  imports: [RouterLink, FormsModule, DecimalPipe],
  selector: 'app-account',
  styleUrl: './account.css',
  templateUrl: './account.html',
})
export class AccountPageComponent {
  private authService = inject(AuthService);
  private bookingService = inject(BookingService);
  private preferencesService = inject(AccountPreferencesService);

  readonly filters = FILTERS;
  readonly statusLabel = STATUS_LABEL;
  readonly formatBookingDate = formatBookingDate;

  activeTab = signal<AccountTab>('bookings');
  activeFilter = signal<BookingFilter>('all');

  displayName = computed(() => this.authService.displayName());
  avatarInitials = computed(() => initials(this.displayName()));
  email = computed(() => this.authService.user()?.email ?? '');

  private savedBookings = signal<SavedBooking[]>([]);
  bookingsLoading = signal(true);
  bookingsError = signal('');

  bookings = computed(() => this.savedBookings().map(toAccountBooking));
  tripsTaken = computed(() => this.bookings().length);
  upcomingTrips = computed(() => this.bookings().filter((booking) => booking.status === 'confirmed').length);

  filteredBookings = computed(() => {
    const filter = this.activeFilter();
    const bookings = this.bookings();
    if (filter === 'all') {
      return bookings;
    }
    if (filter === 'upcoming') {
      return bookings.filter((booking) => booking.status === 'confirmed');
    }
    return bookings.filter((booking) => booking.status === filter);
  });

  emergencyContact = this.preferencesService.getEmergencyContact();
  notifications = this.preferencesService.getNotifications();

  // Profile form state, seeded from the loaded user once (not on every
  // change) so it doesn't clobber an in-progress edit.
  private profileSeeded = signal(false);
  fullName = signal('');
  phone = signal('');
  savingProfile = signal(false);
  profileSaved = signal(false);

  contactName = signal(this.emergencyContact().contactName);
  contactPhone = signal(this.emergencyContact().contactPhone);
  savingContact = signal(false);
  contactSaved = signal(false);

  changingPassword = signal(false);
  newPassword = signal('');
  confirmPassword = signal('');
  savingPassword = signal(false);
  passwordMessage = signal('');
  passwordError = signal('');

  confirmingDelete = signal(false);
  accountDeleted = signal(false);

  constructor() {
    effect(() => {
      const user = this.authService.user();
      if (user && !this.profileSeeded()) {
        this.fullName.set((user.user_metadata?.['name'] as string) ?? '');
        this.phone.set((user.user_metadata?.['phone'] as string) ?? '');
        this.profileSeeded.set(true);
      }
    });
    this.loadBookings();
  }

  private async loadBookings(): Promise<void> {
    this.bookingsLoading.set(true);
    this.bookingsError.set('');
    try {
      this.savedBookings.set(await this.bookingService.getMyBookings());
    } catch {
      this.bookingsError.set('Could not load your bookings. Please try again.');
    } finally {
      this.bookingsLoading.set(false);
    }
  }

  setTab(tab: AccountTab): void {
    this.activeTab.set(tab);
  }

  setFilter(filter: BookingFilter): void {
    this.activeFilter.set(filter);
  }

  async saveProfile(): Promise<void> {
    this.savingProfile.set(true);
    this.profileSaved.set(false);
    try {
      await this.authService.updateProfile({ name: this.fullName().trim(), phone: this.phone().trim() });
      this.profileSaved.set(true);
    } finally {
      this.savingProfile.set(false);
    }
  }

  saveContact(): void {
    this.savingContact.set(true);
    this.contactSaved.set(false);
    this.preferencesService.updateEmergencyContact(this.contactName().trim(), this.contactPhone().trim());
    this.savingContact.set(false);
    this.contactSaved.set(true);
  }

  toggleNotification(key: keyof NotificationSettings): void {
    this.preferencesService.toggleNotification(key);
  }

  requestPasswordChange(): void {
    this.changingPassword.set(true);
  }

  cancelPasswordChange(): void {
    this.changingPassword.set(false);
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.passwordMessage.set('');
    this.passwordError.set('');
  }

  async savePassword(): Promise<void> {
    this.passwordMessage.set('');
    this.passwordError.set('');

    if (this.newPassword().length < 6) {
      this.passwordError.set('Password must be at least 6 characters.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('Passwords do not match.');
      return;
    }

    this.savingPassword.set(true);
    try {
      await this.authService.updatePassword(this.newPassword());
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.passwordMessage.set('Password updated.');
    } catch (error) {
      this.passwordError.set(error instanceof Error ? error.message : 'Could not update your password. Please try again.');
    } finally {
      this.savingPassword.set(false);
    }
  }

  requestDeleteAccount(): void {
    this.confirmingDelete.set(true);
  }

  cancelDeleteAccount(): void {
    this.confirmingDelete.set(false);
  }

  /** Demo-only: self-service account deletion needs an admin-privileged
   * backend call, which doesn't exist yet. */
  deleteAccount(): void {
    this.confirmingDelete.set(false);
    this.accountDeleted.set(true);
  }
}
