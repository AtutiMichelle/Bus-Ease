import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { AdminRoute, RouteFormValue } from '../models/admin-fleet.model';

interface RouteRow {
  id: string;
  origin: string;
  destination: string;
  duration_minutes: number;
  buses: { count: number }[] | null;
}

function mapRouteRow(row: RouteRow): AdminRoute {
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    durationMinutes: row.duration_minutes,
    tripCount: row.buses?.[0]?.count ?? 0,
  };
}

/** Routes are readable by anyone already (the public search page depends on
 * it), so listing queries the table directly. Only writes go through the
 * admin_route_* functions in supabase/sql/2026-09-22-admin-routes-trips.sql,
 * since there is no public insert/update/delete policy. */
@Injectable({ providedIn: 'root' })
export class AdminRoutesService {
  private client = inject(Supabase).getClient();

  async list(): Promise<AdminRoute[]> {
    const { data, error } = await this.client
      .from('routes')
      .select('id, origin, destination, duration_minutes, buses(count)')
      .order('origin', { ascending: true });

    if (error) {
      throw error;
    }

    return ((data ?? []) as unknown as RouteRow[]).map(mapRouteRow);
  }

  async create(value: RouteFormValue): Promise<string> {
    const { data, error } = await this.client.rpc('admin_route_upsert', {
      p_id: null,
      p_origin: value.origin.trim(),
      p_destination: value.destination.trim(),
      p_duration_minutes: value.durationMinutes,
    });
    if (error) {
      throw error;
    }
    return data as string;
  }

  async update(id: string, value: RouteFormValue): Promise<void> {
    const { error } = await this.client.rpc('admin_route_upsert', {
      p_id: id,
      p_origin: value.origin.trim(),
      p_destination: value.destination.trim(),
      p_duration_minutes: value.durationMinutes,
    });
    if (error) {
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client.rpc('admin_route_delete', { p_id: id });
    if (error) {
      throw error;
    }
  }
}
