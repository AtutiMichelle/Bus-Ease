import { Component, DestroyRef, HostListener, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BusService } from '../../services/bus.service';
import { Bus } from '../../models/bus.model';

interface UiSeat {
  number: string;
  status: 'available' | 'selected' | 'booked';
  className?: 'VIP' | 'Business' | 'Normal';
  price?: number;
}

/** A physical seat row. Most rows split evenly into a left/right pair either
 * side of the aisle; a row with an odd seat count (the back bench row, which
 * commonly seats 5) additionally has one `middle` seat sitting in the aisle
 * gap itself. */
interface SeatRowLayout {
  left: UiSeat[];
  middle?: UiSeat;
  right: UiSeat[];
}

function splitRow(rowSeats: UiSeat[]): SeatRowLayout {
  const hasMiddle = rowSeats.length % 2 === 1;
  const middle = hasMiddle ? rowSeats[rowSeats.length - 1] : undefined;
  const pairSeats = hasMiddle ? rowSeats.slice(0, -1) : rowSeats;
  const half = Math.ceil(pairSeats.length / 2);
  return { left: pairSeats.slice(0, half), middle, right: pairSeats.slice(half) };
}

@Component({
  selector: 'app-seat-panel',
  styleUrl: './seat-panel.css',
  templateUrl: './seat-panel.html',
  imports: [NgTemplateOutlet, FormsModule],
})
export class SeatPanel {
  busId = input.required<string>();
  closed = output<void>();

  bus = signal<Bus | undefined>(undefined);
  seats = signal<UiSeat[]>([]);
  selectedSeats = signal<string[]>([]);
  loading = signal(true);
  errorMessage = signal('');

  /** Optional boarding/drop-off stage picks. Purely local UI state — not
   * wired to any backend data or the seat-selection flow. */
  boardingPoint = signal('');
  dropoffPoint = signal('');

  totalPrice = computed(() => {
    const fallback = this.bus()?.price ?? 0;
    return this.seats()
      .filter((seat) => seat.status === 'selected')
      .reduce((sum, seat) => sum + (seat.price ?? fallback), 0);
  });

  selectedSeatDetails = computed(() => this.seats().filter((seat) => seat.status === 'selected'));

  /** Seats grouped by their real row number (the leading digits of the seat number),
   * then split left/right of the aisle — with a `middle` seat when a row has an odd
   * count, e.g. a 5-seat back bench row. */
  seatRows = computed(() => {
    const byRow = new Map<number, UiSeat[]>();
    for (const seat of this.seats()) {
      const rowNum = parseInt(seat.number, 10) || 0;
      const row = byRow.get(rowNum);
      if (row) {
        row.push(seat);
      } else {
        byRow.set(rowNum, [seat]);
      }
    }
    return Array.from(byRow.entries())
      .sort(([a], [b]) => a - b)
      .map(([rowNumber, rowSeats]) => ({ rowNumber, ...splitRow(rowSeats) }));
  });

  private static readonly CLASS_RANK: Record<string, number> = { VIP: 0, Business: 1, Normal: 2 };

  /** Distinct classes actually present on this bus's seat map, in VIP/Business/Normal
   * order, so the legend only ever shows classes a rider could actually pick. */
  legendClasses = computed(() => {
    const names = new Set(
      this.seats()
        .map((seat) => seat.className)
        .filter((name): name is NonNullable<typeof name> => !!name),
    );
    return Array.from(names).sort((a, b) => (SeatPanel.CLASS_RANK[a] ?? 99) - (SeatPanel.CLASS_RANK[b] ?? 99));
  });

  private busService = inject(BusService);
  private router = inject(Router);

  constructor() {
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
    });

    effect(() => {
      this.load(this.busId());
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  private async load(busId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.selectedSeats.set([]);
    this.boardingPoint.set('');
    this.dropoffPoint.set('');
    try {
      const [bus, seats] = await Promise.all([this.busService.getById(busId), this.busService.getSeats(busId)]);
      this.bus.set(bus);
      this.seats.set(
        seats.map((seat) => ({ number: seat.number, status: seat.status, className: seat.className, price: seat.price })),
      );
      if (!bus) {
        this.errorMessage.set('We could not find that bus.');
      }
    } catch {
      this.errorMessage.set('Could not load the seat map. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  toggleSeat(seat: UiSeat): void {
    if (seat.status === 'booked') {
      return;
    }
    const isSelected = seat.status === 'selected';
    this.seats.update((seats) =>
      seats.map((s) => (s.number === seat.number ? { ...s, status: isSelected ? 'available' : 'selected' } : s)),
    );
    this.selectedSeats.update((selected) =>
      isSelected ? selected.filter((n) => n !== seat.number) : [...selected, seat.number],
    );
  }

  continue(): void {
    const bus = this.bus();
    if (this.selectedSeats().length === 0 || !bus) {
      return;
    }
    this.router.navigate(['/confirmation'], {
      queryParams: {
        busId: bus.id,
        origin: bus.from,
        destination: bus.to,
        journeyDate: bus.date,
        seats: this.selectedSeats().join(','),
      },
    });
  }
}
