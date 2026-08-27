import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { Bus, BusClassOption } from '../models/bus.model';

export interface Seat {
  id: string;
  number: string;
  status: 'available' | 'booked';
}

export interface BusClassRow {
  class_name: string;
  price: string | number;
}

export interface BusRow {
  id: string;
  operator: string;
  bus_type: string;
  base_price: string | number;
  departure_time: string;
  arrival_time: string;
  total_seats: number;
  available_seats: number;
  routes: {
    origin: string;
    destination: string;
    duration_minutes: number;
  };
  bus_classes?: BusClassRow[];
}

export const BUS_ROW_SELECT =
  'id, operator, bus_type, base_price, departure_time, arrival_time, total_seats, available_seats, routes!inner(origin, destination, duration_minutes)';

export const BUS_ROW_SELECT_WITH_CLASSES = `${BUS_ROW_SELECT}, bus_classes(class_name, price)`;

const CLASS_RANK: Record<string, number> = { VIP: 0, Business: 1, Normal: 2 };

function mapClasses(rows: BusClassRow[] | undefined): BusClassOption[] {
  return (rows ?? [])
    .map((row) => ({ className: row.class_name as BusClassOption['className'], price: Number(row.price) }))
    .sort((a, b) => (CLASS_RANK[a.className] ?? 99) - (CLASS_RANK[b.className] ?? 99));
}

export function mapBusRow(row: BusRow): Bus {
  return {
    id: row.id,
    operator: row.operator,
    from: row.routes.origin,
    to: row.routes.destination,
    date: toDateString(row.departure_time),
    departureTime: formatTime(row.departure_time),
    arrivalTime: formatTime(row.arrival_time),
    duration: formatDuration(row.routes.duration_minutes),
    busType: row.bus_type as Bus['busType'],
    price: Number(row.base_price),
    seatsAvailable: row.available_seats,
    totalSeats: row.total_seats,
    classes: mapClasses(row.bus_classes),
  };
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function toDateString(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Seat numbers look like "1A".."10D" — sort by row number then column letter,
 * not lexically (text sort would put "10A" before "2A"). */
function seatSortKey(seatNumber: string): [number, string] {
  const match = seatNumber.match(/^(\d+)([A-Za-z]+)$/);
  return match ? [parseInt(match[1], 10), match[2]] : [0, seatNumber];
}

@Injectable({ providedIn: 'root' })
export class BusService {
  private client = inject(Supabase).getClient();
  private cache = new Map<string, Bus>();

  async search(origin: string, destination: string, date: string): Promise<Bus[]> {
    let query = this.client
      .from('buses')
      .select(BUS_ROW_SELECT_WITH_CLASSES)
      .ilike('routes.origin', origin.trim())
      .ilike('routes.destination', destination.trim());

    if (date) {
      query = query.gte('departure_time', `${date}T00:00:00`).lte('departure_time', `${date}T23:59:59`);
    }

    const { data, error } = await query.order('departure_time', { ascending: true });
    if (error) {
      throw error;
    }

    const buses = ((data ?? []) as unknown as BusRow[]).map(mapBusRow);
    for (const bus of buses) {
      this.cache.set(bus.id, bus);
    }
    return buses;
  }

  async getById(id: string): Promise<Bus | undefined> {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    const { data, error } = await this.client
      .from('buses')
      .select(BUS_ROW_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return undefined;
    }

    const bus = mapBusRow(data as unknown as BusRow);
    this.cache.set(bus.id, bus);
    return bus;
  }

  async getSeats(busId: string): Promise<Seat[]> {
    const { data, error } = await this.client
      .from('seats')
      .select('id, seat_number, status')
      .eq('bus_id', busId);

    if (error) {
      throw error;
    }

    return (data ?? [])
      .map((row) => ({
        id: row.id,
        number: row.seat_number,
        status: (row.status === 'available' ? 'available' : 'booked') as Seat['status'],
      }))
      .sort((a, b) => {
        const [rowA, colA] = seatSortKey(a.number);
        const [rowB, colB] = seatSortKey(b.number);
        return rowA - rowB || colA.localeCompare(colB);
      });
  }
}
