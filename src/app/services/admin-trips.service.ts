import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { AdminOperator, AdminTrip, TripCreateValue, TripUpdateValue } from '../models/admin-fleet.model';

interface TripRow {
  id: string;
  route_id: string;
  operator_id: string;
  bus_type: AdminTrip['busType'];
  base_price: string | number;
  departure_time: string;
  arrival_time: string;
  total_seats: number;
  available_seats: number;
  routes: { origin: string; destination: string };
  operators: { name: string; logo_url: string | null };
  bus_classes: { class_name: AdminTrip['classes'][number]['className']; price: string | number }[] | null;
  bus_amenities: { amenity: string }[] | null;
}

const TRIP_SELECT =
  'id, route_id, operator_id, bus_type, base_price, departure_time, arrival_time, total_seats, available_seats, ' +
  'routes!inner(origin, destination), operators!inner(name, logo_url), bus_classes(class_name, price), bus_amenities(amenity)';

const CLASS_RANK: Record<string, number> = { VIP: 0, Business: 1, Normal: 2 };

function mapTripRow(row: TripRow): AdminTrip {
  return {
    id: row.id,
    routeId: row.route_id,
    origin: row.routes.origin,
    destination: row.routes.destination,
    operatorId: row.operator_id,
    operatorName: row.operators.name,
    operatorLogo: row.operators.logo_url,
    busType: row.bus_type,
    basePrice: Number(row.base_price),
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    totalSeats: row.total_seats,
    availableSeats: row.available_seats,
    classes: (row.bus_classes ?? [])
      .map((c) => ({ className: c.class_name, price: Number(c.price) }))
      .sort((a, b) => (CLASS_RANK[a.className] ?? 99) - (CLASS_RANK[b.className] ?? 99)),
    amenities: (row.bus_amenities ?? []).map((a) => a.amenity),
  };
}

/** Trips (buses) are readable by anyone already (the public search page
 * depends on it), so listing queries the table directly. Only writes go
 * through the admin_trip_* functions in
 * supabase/sql/2026-09-22-admin-routes-trips.sql, since there is no public
 * insert/update/delete policy, and creating a trip also has to generate its
 * seat layout server-side. */
@Injectable({ providedIn: 'root' })
export class AdminTripsService {
  private client = inject(Supabase).getClient();

  async list(): Promise<AdminTrip[]> {
    const { data, error } = await this.client
      .from('buses')
      .select(TRIP_SELECT)
      .order('departure_time', { ascending: false });

    if (error) {
      throw error;
    }

    return ((data ?? []) as unknown as TripRow[]).map(mapTripRow);
  }

  async listOperators(): Promise<AdminOperator[]> {
    const { data, error } = await this.client.from('operators').select('id, name, logo_url').order('name', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => ({ id: row.id, name: row.name, logoUrl: row.logo_url }));
  }

  async create(value: TripCreateValue): Promise<string> {
    const { data, error } = await this.client.rpc('admin_trip_create', {
      p_route_id: value.routeId,
      p_bus_type: value.busType,
      p_departure_time: value.departureTime,
      p_arrival_time: value.arrivalTime,
      p_base_price: value.basePrice,
      p_rows: value.rows,
      p_classes: value.classes.map((c) => ({ class_name: c.className, price: c.price })),
      p_amenities: value.amenities,
      p_operator_id: value.operatorId,
      p_new_operator_name: value.newOperatorName,
    });
    if (error) {
      throw error;
    }
    return data as string;
  }

  async update(id: string, value: TripUpdateValue): Promise<void> {
    const { error } = await this.client.rpc('admin_trip_update', {
      p_id: id,
      p_route_id: value.routeId,
      p_bus_type: value.busType,
      p_departure_time: value.departureTime,
      p_arrival_time: value.arrivalTime,
      p_base_price: value.basePrice,
      p_amenities: value.amenities,
      p_operator_id: value.operatorId,
      p_new_operator_name: value.newOperatorName,
    });
    if (error) {
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client.rpc('admin_trip_delete', { p_id: id });
    if (error) {
      throw error;
    }
  }
}
