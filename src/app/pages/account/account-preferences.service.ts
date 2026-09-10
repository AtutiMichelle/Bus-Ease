import { Injectable, signal } from '@angular/core';
import { EmergencyContact, NotificationSettings } from './account.model';

/**
 * Emergency contact and notification preferences have no backing table in
 * Supabase yet, so this holds them in memory only (resets on reload) until
 * that schema exists. Profile and booking data come from AuthService /
 * BookingService instead — see AccountPageComponent.
 */
@Injectable({ providedIn: 'root' })
export class AccountPreferencesService {
  private readonly emergencyContact = signal<EmergencyContact>({
    contactName: '',
    contactPhone: '',
  });

  private readonly notifications = signal<NotificationSettings>({
    bookingConfirmations: true,
    tripReminders: true,
    promotions: false,
  });

  getEmergencyContact() {
    return this.emergencyContact.asReadonly();
  }

  getNotifications() {
    return this.notifications.asReadonly();
  }

  updateEmergencyContact(contactName: string, contactPhone: string): void {
    this.emergencyContact.set({ contactName, contactPhone });
  }

  toggleNotification(key: keyof NotificationSettings): void {
    this.notifications.update((current) => ({ ...current, [key]: !current[key] }));
  }
}
