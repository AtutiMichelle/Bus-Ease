import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../environment';
import { TravlerApiService } from '../travler/travler-api.service';
import { SupabaseTripProvider } from './supabase-trip-provider';
import { TripProvider } from './trip-provider';

/** The live trip source, picked once from environment.tripProvider. Only the
 * chosen provider is ever created. */
export const TRIP_PROVIDER = new InjectionToken<TripProvider>('TripProvider', {
  providedIn: 'root',
  factory: () => (environment.tripProvider === 'supabase' ? inject(SupabaseTripProvider) : inject(TravlerApiService)),
});
