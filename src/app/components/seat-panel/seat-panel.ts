import { Component, DestroyRef, HostListener, computed, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BusService } from '../../services/bus.service';
import { Bus } from '../../models/bus.model';

interface UiSeat {
  number: string;
  status: 'available' | 'selected' | 'booked';
  className?: 'VIP' | 'Business' | 'Normal';
  price?: number;
}

@Component({
  selector: 'app-seat-panel',
  styleUrl: './seat-panel.css',
  templateUrl: './seat-panel.html',
})
export class SeatPanel {
  busId = input.required<string>();
  closed = output<void>();

  bus = signal<Bus | undefined>(undefined);
  seats = signal<UiSeat[]>([]);
  selectedSeats = signal<string[]>([]);
  loading = signal(true);
  errorMessage = signal('');

  totalPrice = computed(() => {
    const fallback = this.bus()?.price ?? 0;
    return this.seats()
      .filter((seat) => seat.status === 'selected')
      .reduce((sum, seat) => sum + (seat.price ?? fallback), 0);
  });

  /** Seats grouped 4 per row so the template can render a real aisle gap between B and C. */
  seatRows = computed(() => {
    const seats = this.seats();
    const rows: UiSeat[][] = [];
    for (let i = 0; i < seats.length; i += 4) {
      rows.push(seats.slice(i, i + 4));
    }
    return rows;
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
