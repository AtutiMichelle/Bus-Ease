import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { TravlerApiService } from '../../travler/travler-api.service';
import { travlerErrorMessage } from '../../travler/travler-errors';
import { BoardingDroppingPoints, LayoutSeat, SeatClassName, SeatLayout, Trip } from '../../models/trip.model';
import { SelectedSeat } from '../../models/booking.model';

/** No one, logged in or not, can select more than this many seats in one booking. */
const MAX_SEATS_PER_BOOKING = 6;

/** Seats never grow past this multiple of the layout's own size, so a
 * small bus in a wide panel doesn't turn into giant buttons. */
const MAX_SCALE = 1.4;

interface PlacedSeat {
  seat: LayoutSeat;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  disabled: boolean;
}

interface LegendEntry {
  label: string;
  className?: SeatClassName;
  price: number;
}

@Component({
  selector: 'app-seat-panel',
  styleUrl: './seat-panel.css',
  templateUrl: './seat-panel.html',
  imports: [FormsModule, DecimalPipe],
})
export class SeatPanel {
  trip = input.required<Trip>();
  closed = output<void>();

  private travler = inject(TravlerApiService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private authModal = inject(AuthModalService);
  private bookingDraft = inject(BookingDraftService);

  layout = signal<SeatLayout | undefined>(undefined);
  points = signal<BoardingDroppingPoints>({ boarding: [], dropping: [] });
  loading = signal(true);
  errorMessage = signal('');
  selectionNotice = signal('');
  selectedIds = signal<string[]>([]);
  boardingId = signal('');
  droppingId = signal('');
  /** Set once the user tries to continue, so missing stops only show as errors then. */
  triedContinue = signal(false);

  readonly maxSeats = MAX_SEATS_PER_BOOKING;
  isGuest = computed(() => !this.authService.user());

  private seatMap = viewChild<ElementRef<HTMLElement>>('seatMap');
  private mapWidth = signal(0);

  selectedSeats = computed(() => {
    const byId = new Map((this.layout()?.seats ?? []).map((seat) => [seat.id, seat]));
    return this.selectedIds()
      .map((id) => byId.get(id))
      .filter((seat): seat is LayoutSeat => !!seat);
  });

  totalPrice = computed(() => this.selectedSeats().reduce((sum, seat) => sum + (seat.price ?? 0), 0));

  legend = computed<LegendEntry[]>(() => {
    const byType = new Map<string, LegendEntry>();
    for (const seat of this.layout()?.seats ?? []) {
      if (seat.price !== null && !byType.has(seat.type)) {
        byType.set(seat.type, { label: seat.typeLabel, className: seat.className, price: seat.price });
      }
    }
    return [...byType.values()].sort((a, b) => b.price - a.price);
  });

  /** The API lays the bus out sideways (front on the left). Turn it upright
   * (front at the top) whenever it's wider than tall, so it fits a narrow
   * panel and scrolls down like the real aisle. */
  private upright = computed(() => {
    const layout = this.layout();
    return !!layout && layout.width > layout.height;
  });

  private naturalWidth = computed(() => {
    const layout = this.layout();
    return layout ? (this.upright() ? layout.height : layout.width) : 0;
  });

  private scale = computed(() => {
    const natural = this.naturalWidth();
    const available = this.mapWidth();
    return natural > 0 && available > 0 ? Math.min(MAX_SCALE, available / natural) : 1;
  });

  mapHeight = computed(() => {
    const layout = this.layout();
    return layout ? (this.upright() ? layout.width : layout.height) * this.scale() : 0;
  });

  labelSize = computed(() => Math.max(10, Math.min(15, 12 * this.scale())));

  placedSeats = computed<PlacedSeat[]>(() => {
    const layout = this.layout();
    if (!layout) {
      return [];
    }
    const scale = this.scale();
    const upright = this.upright();
    const selected = new Set(this.selectedIds());
    return layout.seats.map((seat) => {
      // Rotating a left-facing bus 90° clockwise: the left edge becomes the
      // top, and the bottom (door side) becomes the left.
      const x = upright ? layout.height - (seat.top + seat.height) : seat.left;
      const y = upright ? seat.left : seat.top;
      const width = upright ? seat.height : seat.width;
      const height = upright ? seat.width : seat.height;
      return {
        seat,
        x: x * scale,
        y: y * scale,
        width: width * scale,
        height: height * scale,
        selected: selected.has(seat.id),
        disabled: seat.status === 'taken' || seat.price === null,
      };
    });
  });

  canContinue = computed(() => this.selectedIds().length > 0 && !!this.boardingId() && !!this.droppingId());

  constructor() {
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
    });

    effect(() => {
      const trip = this.trip();
      untracked(() => this.load(trip));
    });

    // Scale the seat map to whatever width the panel gives it.
    effect((onCleanup) => {
      const element = this.seatMap()?.nativeElement;
      if (!element) {
        return;
      }
      this.mapWidth.set(element.clientWidth);
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => this.mapWidth.set(entries[0].contentRect.width));
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  private async load(trip: Trip): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.selectedIds.set([]);
    this.layout.set(undefined);
    try {
      const [layout, points] = await Promise.all([
        this.travler.getSeatLayout(trip),
        this.travler.getBoardingDroppingPoints(trip),
      ]);
      this.layout.set(layout);
      this.points.set(points);
      // With only one option there's nothing to choose, so pick it.
      this.boardingId.set(points.boarding.length === 1 ? points.boarding[0].id : '');
      this.droppingId.set(points.dropping.length === 1 ? points.dropping[0].id : '');
      if (layout.seats.length === 0) {
        this.errorMessage.set("This bus doesn't have a seat map yet.");
      }
    } catch (error) {
      this.errorMessage.set(travlerErrorMessage(error, 'Could not load the seat map. Please try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  retry(): void {
    this.load(this.trip());
  }

  seatLabel(placed: PlacedSeat): string {
    const { seat } = placed;
    if (seat.status === 'taken') {
      return `Seat ${seat.name}, taken`;
    }
    if (seat.price === null) {
      return `Seat ${seat.name}, not available`;
    }
    return `Seat ${seat.name}, ${seat.typeLabel}, KES ${seat.price}${placed.selected ? ', selected' : ''}`;
  }

  toggleSeat(placed: PlacedSeat): void {
    if (placed.disabled) {
      return;
    }
    const id = placed.seat.id;
    if (!placed.selected) {
      if (this.selectedIds().length >= this.maxSeats) {
        this.selectionNotice.set(`You can book up to ${this.maxSeats} seats at a time.`);
        return;
      }
      if (this.isGuest() && this.selectedIds().length >= 1) {
        this.authModal.open('login', this.router.url);
        return;
      }
    }
    this.selectionNotice.set('');
    this.selectedIds.update((ids) => (placed.selected ? ids.filter((n) => n !== id) : [...ids, id]));
  }

  continue(): void {
    this.triedContinue.set(true);
    const boarding = this.points().boarding.find((p) => p.id === this.boardingId());
    const dropping = this.points().dropping.find((p) => p.id === this.droppingId());
    const seats = this.selectedSeats();
    if (seats.length === 0 || !boarding || !dropping) {
      return;
    }
    const trip = this.trip();
    this.bookingDraft.set({
      trip,
      seats: seats.map(
        (seat): SelectedSeat => ({
          id: seat.id,
          name: seat.name,
          type: seat.type,
          typeLabel: seat.typeLabel,
          className: seat.className,
          price: seat.price ?? 0,
        }),
      ),
      boarding,
      dropping,
    });
    this.router.navigate(['/confirmation'], {
      queryParams: { busId: trip.id, seats: seats.map((seat) => seat.name).join(',') },
    });
  }
}
