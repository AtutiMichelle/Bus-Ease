import { Bus, BusClassOption } from '../models/bus.model';
import { LayoutSeat, SeatLayout, Trip, TripSearchContext } from '../models/trip.model';
import { Seat } from '../services/bus.service';

/** Seat type keys, matching the ones the Travler API uses, so the rest of
 * the app sees one vocabulary whichever source is live. */
const TYPE_BY_CLASS: Record<BusClassOption['className'], string> = {
  VIP: 'vip',
  Business: 'bclass',
  Normal: 'normal',
};

/** Seat size and spacing for the drawn layout, in the layout's own units. */
const SEAT_SIZE = 36;
const SEAT_GAP = 8;
const STEP = SEAT_SIZE + SEAT_GAP;

export function tripFromBus(bus: Bus, context: TripSearchContext): Trip {
  return {
    id: bus.id,
    // Supabase buses are unique by id alone.
    routeId: '',
    operator: bus.operator,
    operatorLogo: bus.operatorLogo,
    fromCityId: context.fromCityId,
    toCityId: context.toCityId,
    from: bus.from,
    to: bus.to,
    date: bus.date,
    departureTime: bus.departureTime,
    departureHour: bus.departureHour,
    arrivalTime: bus.arrivalTime,
    duration: bus.duration,
    busType: bus.busType,
    seatsAvailable: bus.seatsAvailable,
    fromPrice: bus.classes.length > 0 ? Math.min(...bus.classes.map((c) => c.price)) : bus.price,
    classes: bus.classes,
    amenities: bus.amenities,
    rating: bus.rating,
    isPromotional: false,
  };
}

/** "3B" -> [3, "B"]. Anything else sorts first, as its own row 0. */
function seatPosition(seatNumber: string): [number, string] {
  const match = seatNumber.match(/^(\d+)([A-Za-z]*)$/);
  return match ? [parseInt(match[1], 10), match[2].toUpperCase()] : [0, seatNumber];
}

/** Supabase seats have names, not coordinates, so this places them the way
 * the old seat map did: one row per leading number, front row at the top,
 * seats split either side of the aisle, and an odd seat out (the back
 * bench's "E") in the aisle itself. */
export function seatLayoutFromSeats(seats: Seat[], basePrice: number): SeatLayout {
  const rows = new Map<number, Seat[]>();
  for (const seat of seats) {
    const [row] = seatPosition(seat.number);
    rows.set(row, [...(rows.get(row) ?? []), seat]);
  }

  const placed: LayoutSeat[] = [];
  [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([, rowSeats], rowIndex) => {
      const ordered = [...rowSeats].sort((a, b) => seatPosition(a.number)[1].localeCompare(seatPosition(b.number)[1]));
      const middle = ordered.length % 2 === 1 ? ordered.pop() : undefined;
      const perSide = ordered.length / 2;
      const columns: [Seat, number][] = ordered.map((seat, i) => [seat, i < perSide ? i : i + 1]);
      if (middle) {
        columns.push([middle, perSide]);
      }
      for (const [seat, column] of columns) {
        const type = seat.className ? TYPE_BY_CLASS[seat.className] : '';
        placed.push({
          id: seat.id,
          name: seat.number,
          type,
          typeLabel: seat.className ?? 'Seat',
          className: seat.className,
          status: seat.status === 'booked' ? 'taken' : 'available',
          // Same fallback confirm_booking charges: the class price, else the bus's base price.
          price: seat.price ?? basePrice,
          left: column * STEP,
          top: rowIndex * STEP,
          width: SEAT_SIZE,
          height: SEAT_SIZE,
        });
      }
    });

  return {
    seats: placed,
    width: placed.length ? Math.max(...placed.map((s) => s.left + s.width)) : 0,
    height: placed.length ? Math.max(...placed.map((s) => s.top + s.height)) : 0,
    bookedCount: placed.filter((s) => s.status === 'taken').length,
  };
}
