import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { TRIP_PROVIDER } from '../../trips/trip-provider.token';
import { tripErrorMessage } from '../../trips/trip-errors';
import { BoardingDroppingPoints, LayoutSeat, SeatClassName, SeatLayout, Trip } from '../../models/trip.model';
import { SelectedSeat } from '../../models/booking.model';
import { VoiceStateService } from '../../voice/voice-state.service';
import { VoiceDock } from '../../voice/voice-dock/voice-dock';
import { VoiceStepsService } from '../../voice/voice-steps.service';
import { SeatsVoiceStep } from '../../voice/steps/seats-step';
import { CityNamePipe } from '../../utils/city-name';

/** No one, logged in or not, can select more than this many seats in one booking. */
const MAX_SEATS_PER_BOOKING = 6;

/** Seat edges closer than this share of a seat land in the same grid track. */
const ALIGN_TOLERANCE = 0.5;

/** Empty space wider than this share of a seat between two tracks is an aisle. */
const AISLE_GAP = 0.5;

type TrackKind = 'seat' | 'aisle';

interface Span {
  start: number;
  size: number;
}

interface GridCell {
  seat: LayoutSeat;
  row: number;
  rowSpan: number;
  col: number;
  colSpan: number;
}

interface PlacedSeat extends GridCell {
  selected: boolean;
  disabled: boolean;
}

/** Lines seats up into grid tracks along one axis, adding an aisle track at each wide gap. */
function gridAxis(spans: Span[]): { kinds: TrackKind[]; place: (span: Span) => { line: number; span: number } } {
  const unit = Math.min(...spans.map((s) => s.size));
  const tolerance = unit * ALIGN_TOLERANCE;
  const starts: number[] = [];
  for (const start of spans.map((s) => s.start).sort((a, b) => a - b)) {
    if (starts.length === 0 || start - starts[starts.length - 1] > tolerance) {
      starts.push(start);
    }
  }

  const kinds: TrackKind[] = [];
  const trackOf: number[] = [];
  starts.forEach((start, i) => {
    if (i > 0 && start - starts[i - 1] - unit > unit * AISLE_GAP) {
      kinds.push('aisle');
    }
    trackOf.push(kinds.length);
    kinds.push('seat');
  });

  const lastStartBefore = (edge: number) => starts.filter((start) => start <= edge).length - 1;
  const place = ({ start, size }: Span) => {
    const first = lastStartBefore(start + tolerance);
    const last = Math.max(first, lastStartBefore(start + size - tolerance));
    return { line: trackOf[first] + 1, span: trackOf[last] - trackOf[first] + 1 };
  };
  return { kinds, place };
}

/** Track sizes for grid-template-*, with runs of one kind folded into repeat(). */
function trackTemplate(kinds: TrackKind[], seat: string, aisle: string): string {
  const parts: string[] = [];
  for (let i = 0; i < kinds.length; ) {
    let end = i;
    while (end < kinds.length && kinds[end] === kinds[i]) {
      end++;
    }
    const size = kinds[i] === 'seat' ? seat : aisle;
    parts.push(end - i > 1 ? `repeat(${end - i}, ${size})` : size);
    i = end;
  }
  return parts.join(' ');
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
  imports: [FormsModule, DecimalPipe, VoiceDock, CityNamePipe],
})
export class SeatPanel {
  trip = input.required<Trip>();
  closed = output<void>();

  private tripProvider = inject(TRIP_PROVIDER);
  voice = inject(VoiceStateService);
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

  /** The seat map as grid rows and columns, worked out from the layout's seat positions. */
  seatGrid = computed(() => {
    const layout = this.layout();
    if (!layout || layout.seats.length === 0) {
      return { rows: '', columns: '', cells: [] as GridCell[] };
    }
    const upright = this.upright();
    const spans = layout.seats.map((seat) => ({
      seat,
      // Rotating a left-facing bus 90° clockwise: the left edge becomes the
      // top, and the bottom (door side) becomes the left.
      x: { start: upright ? layout.height - (seat.top + seat.height) : seat.left, size: upright ? seat.height : seat.width },
      y: { start: upright ? seat.left : seat.top, size: upright ? seat.width : seat.height },
    }));
    const columns = gridAxis(spans.map((s) => s.x));
    const rows = gridAxis(spans.map((s) => s.y));
    const cells = spans.map(({ seat, x, y }): GridCell => {
      const col = columns.place(x);
      const row = rows.place(y);
      return { seat, row: row.line, rowSpan: row.span, col: col.line, colSpan: col.span };
    });

    // A column with seats in under half the rows (a back bench's middle seat) is the aisle.
    const seatRows = rows.kinds.filter((kind) => kind === 'seat').length;
    const columnKinds = columns.kinds.map((kind, i): TrackKind =>
      kind === 'seat' && cells.filter((cell) => cell.col === i + 1).length < seatRows / 2 ? 'aisle' : kind,
    );
    return {
      rows: trackTemplate(rows.kinds, 'var(--seat-row)', 'var(--gap-row)'),
      columns: trackTemplate(columnKinds, 'var(--seat-col)', 'var(--aisle-col)'),
      cells,
    };
  });

  placedSeats = computed<PlacedSeat[]>(() => {
    const selected = new Set(this.selectedIds());
    return this.seatGrid().cells.map((cell) => ({
      ...cell,
      selected: selected.has(cell.seat.id),
      disabled: cell.seat.status === 'taken' || cell.seat.price === null,
    }));
  });

  canContinue = computed(() => this.selectedIds().length > 0 && !!this.boardingId() && !!this.droppingId());

  constructor() {
    document.body.style.overflow = 'hidden';
    // Lets the voice assistant pick seats and stops on this seat map.
    const leaveVoiceStep = inject(VoiceStepsService).enter(
      new SeatsVoiceStep({
        trip: () => this.trip(),
        loading: () => this.loading(),
        errorMessage: () => this.errorMessage(),
        seats: () => this.layout()?.seats ?? [],
        selectedSeats: () => this.selectedSeats(),
        totalPrice: () => this.totalPrice(),
        maxSeats: this.maxSeats,
        isGuest: () => this.isGuest(),
        boardingPoints: () => this.points().boarding,
        droppingPoints: () => this.points().dropping,
        boarding: () => this.points().boarding.find((point) => point.id === this.boardingId()),
        dropping: () => this.points().dropping.find((point) => point.id === this.droppingId()),
        setSelected: (seatIds) => {
          this.selectionNotice.set('');
          this.selectedIds.set(seatIds);
        },
        setBoarding: (id) => this.boardingId.set(id),
        setDropping: (id) => this.droppingId.set(id),
        continue: () => this.continue(),
        close: () => this.close(),
      }),
    );
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
      leaveVoiceStep();
    });

    effect(() => {
      const trip = this.trip();
      untracked(() => this.load(trip));
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
        this.tripProvider.getSeatLayout(trip),
        this.tripProvider.getBoardingDroppingPoints(trip),
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
      this.errorMessage.set(tripErrorMessage(error, 'Could not load the seat map. Please try again.'));
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
