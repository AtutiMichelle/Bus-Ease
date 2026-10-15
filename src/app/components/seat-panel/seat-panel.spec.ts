import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SeatPanel } from './seat-panel';
import { AuthService } from '../../services/auth.service';
import { AuthModalService } from '../../services/auth-modal.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { TRIP_PROVIDER } from '../../trips/trip-provider.token';
import { TripProvider } from '../../trips/trip-provider';
import { TripApiError } from '../../trips/trip-errors';
import { BoardingDroppingPoints, LayoutSeat, SeatLayout, Trip } from '../../models/trip.model';

const TRIP = {
  id: 'bus-1',
  from: 'Nairobi',
  to: 'Mombasa',
  fromCityId: '1',
  toCityId: '2',
  date: '2026-10-20',
} as Trip;

function seat(name: string, extra: Partial<LayoutSeat> = {}): LayoutSeat {
  return {
    id: `id-${name}`,
    name,
    type: 'normal',
    typeLabel: 'Normal',
    status: 'available',
    price: 1500,
    left: 0,
    top: 0,
    width: 30,
    height: 30,
    ...extra,
  };
}

/** Eight free seats, one taken, one with no price. */
const LAYOUT: SeatLayout = {
  seats: [
    ...['1', '2', '3', '4', '5', '6', '7', '8'].map((name) => seat(name)),
    seat('9', { status: 'taken' }),
    seat('10', { price: null }),
  ],
  width: 300,
  height: 400,
  bookedCount: 1,
};

const ONE_STOP_EACH: BoardingDroppingPoints = {
  boarding: [{ id: 'b1', name: 'Town', time: '08:00 AM' }],
  dropping: [{ id: 'd1', name: 'Mombasa', time: '04:00 PM' }],
};

describe('SeatPanel', () => {
  let provider: {
    getSeatLayout: ReturnType<typeof vi.fn>;
    getBoardingDroppingPoints: ReturnType<typeof vi.fn>;
  };
  let signedIn: boolean;
  let openLogin: ReturnType<typeof vi.fn>;

  async function setUp() {
    const fixture = TestBed.createComponent(SeatPanel);
    fixture.componentRef.setInput('trip', TRIP);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const panel = fixture.componentInstance;
    const placed = (name: string) => panel.placedSeats().find((p) => p.seat.name === name)!;
    return { panel, placed, navigate, drafts: TestBed.inject(BookingDraftService) };
  }

  beforeEach(() => {
    sessionStorage.clear();
    signedIn = true;
    openLogin = vi.fn();
    provider = {
      getSeatLayout: vi.fn().mockResolvedValue(LAYOUT),
      getBoardingDroppingPoints: vi.fn().mockResolvedValue(ONE_STOP_EACH),
    };
    TestBed.configureTestingModule({
      imports: [SeatPanel],
      providers: [
        provideRouter([]),
        { provide: TRIP_PROVIDER, useValue: provider as unknown as TripProvider },
        { provide: AuthService, useValue: { user: () => (signedIn ? { id: 'u1' } : null) } },
        { provide: AuthModalService, useValue: { open: openLogin } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads the seat map and picks the stop when there is only one', async () => {
    const { panel } = await setUp();

    expect(provider.getSeatLayout).toHaveBeenCalledWith(TRIP);
    expect(panel.loading()).toBe(false);
    expect(panel.placedSeats()).toHaveLength(10);
    expect(panel.boardingId()).toBe('b1');
    expect(panel.droppingId()).toBe('d1');
  });

  it('leaves the stop empty when there is a choice', async () => {
    provider.getBoardingDroppingPoints.mockResolvedValue({
      boarding: [...ONE_STOP_EACH.boarding, { id: 'b2', name: 'Westlands', time: '08:30 AM' }],
      dropping: ONE_STOP_EACH.dropping,
    });
    const { panel } = await setUp();
    expect(panel.boardingId()).toBe('');
  });

  it('does not let a taken or unpriced seat be picked', async () => {
    const { panel, placed } = await setUp();
    panel.toggleSeat(placed('9'));
    panel.toggleSeat(placed('10'));
    expect(panel.selectedIds()).toEqual([]);
  });

  it('adds up the price of the picked seats, and unpicks on a second tap', async () => {
    const { panel, placed } = await setUp();
    panel.toggleSeat(placed('1'));
    panel.toggleSeat(placed('2'));
    expect(panel.totalPrice()).toBe(3000);

    panel.toggleSeat(placed('1'));
    expect(panel.selectedSeats().map((s) => s.name)).toEqual(['2']);
  });

  it('stops at six seats per booking', async () => {
    const { panel, placed } = await setUp();
    for (const name of ['1', '2', '3', '4', '5', '6', '7']) {
      panel.toggleSeat(placed(name));
    }
    expect(panel.selectedIds()).toHaveLength(6);
    expect(panel.selectionNotice()).toContain('6 seats');
  });

  it('asks a guest to sign in before a second seat', async () => {
    signedIn = false;
    const { panel, placed } = await setUp();
    panel.toggleSeat(placed('1'));
    panel.toggleSeat(placed('2'));

    expect(panel.selectedIds()).toHaveLength(1);
    expect(openLogin).toHaveBeenCalledWith('login', expect.any(String));
  });

  it('does not go on without a seat and both stops', async () => {
    provider.getBoardingDroppingPoints.mockResolvedValue({ boarding: [], dropping: [] });
    const { panel, placed, navigate } = await setUp();
    panel.toggleSeat(placed('1'));

    panel.continue();

    expect(panel.triedContinue()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('saves the picks and goes to passenger details', async () => {
    const { panel, placed, navigate, drafts } = await setUp();
    panel.toggleSeat(placed('3'));
    panel.toggleSeat(placed('1'));

    panel.continue();

    const draft = drafts.current();
    expect(draft?.trip).toBe(TRIP);
    expect(draft?.seats.map((s) => [s.name, s.price])).toEqual([
      ['3', 1500],
      ['1', 1500],
    ]);
    expect(draft?.boarding.id).toBe('b1');
    expect(navigate).toHaveBeenCalledWith(['/confirmation'], {
      queryParams: { busId: 'bus-1', seats: '3,1' },
    });
  });

  it('shows the reason when the seat map cannot load', async () => {
    provider.getSeatLayout.mockRejectedValue(
      new TripApiError('The bus company is not answering.', null, 502, null),
    );
    const { panel } = await setUp();

    expect(panel.errorMessage()).toBe('The bus company is not answering.');
    expect(panel.loading()).toBe(false);
  });

  it('says so when a bus has no seat map', async () => {
    provider.getSeatLayout.mockResolvedValue({ seats: [], width: 0, height: 0, bookedCount: 0 });
    const { panel } = await setUp();
    expect(panel.errorMessage()).toContain("doesn't have a seat map");
  });
});
