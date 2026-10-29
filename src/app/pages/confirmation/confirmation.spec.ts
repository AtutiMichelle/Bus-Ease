import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Confirmation } from './confirmation';
import { BookingDraft, BookingDraftService } from '../../services/booking-draft.service';
import { AuthService } from '../../services/auth.service';
import { TRIP_PROVIDER } from '../../trips/trip-provider.token';
import { TripProvider } from '../../trips/trip-provider';
import { TripApiError } from '../../trips/trip-errors';
import { Trip } from '../../models/trip.model';

const TRIP = {
  id: 'bus-1',
  from: 'Nairobi',
  to: 'Mombasa',
  fromCityId: '1',
  toCityId: '2',
  date: '2026-10-20',
} as Trip;

/** Two seats picked on the seat map, at different prices. */
function pickedDraft(extra: Partial<BookingDraft> = {}): BookingDraft {
  return {
    trip: TRIP,
    seats: [
      { id: 's7', name: '7', type: 'normal', typeLabel: 'Normal', price: 1500 },
      { id: 's1', name: '1', type: 'vip', typeLabel: 'VIP', price: 2200 },
    ],
    boarding: { id: 'b1', name: 'Town', time: '08:00 AM' },
    dropping: { id: 'd1', name: 'Mombasa', time: '04:00 PM' },
    ...extra,
  };
}

const HOLD = {
  reference: 'HOLD-1',
  status: 'held',
  totalAmount: 3700,
  currency: 'KES',
  heldUntil: '2026-10-20T08:10:00Z',
};

describe('Confirmation', () => {
  let provider: { holdMinutes: number; createBooking: ReturnType<typeof vi.fn> };
  let user: { email?: string; user_metadata?: Record<string, unknown> } | null;

  function setUp(draft: BookingDraft = pickedDraft()) {
    TestBed.inject(BookingDraftService).set(draft);
    const fixture = TestBed.createComponent(Confirmation);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return {
      page: fixture.componentInstance,
      navigate,
      drafts: TestBed.inject(BookingDraftService),
    };
  }

  /** Fills every field with valid answers. */
  function fillIn(page: Confirmation) {
    page.updatePassenger(0, 'firstName', '  Jane ');
    page.updatePassenger(0, 'lastName', ' Wanjiku ');
    page.updatePassenger(0, 'gender', 'F');
    page.updatePassenger(0, 'age', ' 34 ');
    page.updatePassenger(0, 'idNumber', ' 12345678 ');
    page.updatePassenger(1, 'firstName', 'Otieno');
    page.updatePassenger(1, 'lastName', 'Ouma');
    page.updatePassenger(1, 'gender', 'M');
    page.updatePassenger(1, 'age', '41');
    page.updatePassenger(1, 'nationality', ' Ugandan ');
    page.updatePassenger(1, 'idNumber', 'A1234567');
    page.contactEmail.set(' jane@example.com ');
    page.contactPhone.set('0712 345 678');
  }

  beforeEach(() => {
    sessionStorage.clear();
    user = null;
    provider = { holdMinutes: 10, createBooking: vi.fn().mockResolvedValue(HOLD) };
    TestBed.configureTestingModule({
      imports: [Confirmation],
      providers: [
        provideRouter([]),
        { provide: TRIP_PROVIDER, useValue: provider as unknown as TripProvider },
        { provide: AuthService, useValue: { user: () => user } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('makes one passenger per picked seat and adds up their prices', () => {
    const { page } = setUp();
    expect(page.passengers().map((p) => p.seatName)).toEqual(['7', '1']);
    expect(page.totalPrice()).toBe(3700);
  });

  it('keeps what was typed before when coming back to the page', () => {
    const { page } = setUp(
      pickedDraft({
        passengers: [
          {
            seatId: 's1',
            seatName: '1',
            seatType: 'vip',
            firstName: 'Otieno',
            lastName: 'Ouma',
            gender: 'M',
            age: '41',
            nationality: 'Ugandan',
            idNumber: 'A1234567',
            price: 2200,
          },
        ],
      }),
    );
    expect(page.passengers()[1]).toMatchObject({ firstName: 'Otieno', lastName: 'Ouma', gender: 'M', nationality: 'Ugandan' });
    expect(page.passengers()[0]).toMatchObject({ firstName: '', gender: '', nationality: 'Kenyan' });
  });

  it('asks for every detail Travler needs', () => {
    const { page } = setUp();
    const blank = page.passengers()[0];
    expect(page.firstNameError(blank)).not.toBe('');
    expect(page.lastNameError(blank)).not.toBe('');
    expect(page.genderError(blank)).not.toBe('');
    expect(page.ageError(blank)).not.toBe('');
    expect(page.ageError({ ...blank, age: '3.5' })).not.toBe('');
    expect(page.ageError({ ...blank, age: '7' })).toBe('');
    expect(page.nationalityError({ ...blank, nationality: ' ' })).not.toBe('');
    expect(page.isPassengerComplete(blank)).toBe(false);
  });

  it('starts the contact details from the signed-in account', () => {
    user = { email: 'jane@example.com', user_metadata: { phone: '254712345678' } };
    const { page } = setUp();
    expect(page.contactEmail()).toBe('jane@example.com');
    expect(page.contactPhone()).toBe('254712345678');
  });

  it('does not book while a field is missing or wrong, and opens the passenger with the problem', async () => {
    const { page } = setUp();
    fillIn(page);
    page.updatePassenger(1, 'idNumber', 'has spaces 1');
    page.expandedRows.set(new Set());

    await page.confirmBooking();

    expect(provider.createBooking).not.toHaveBeenCalled();
    expect(page.idError(page.passengers()[1])).not.toBe('');
    expect(page.expandedRows().has(1)).toBe(true);
    expect(page.expandedRows().has(0)).toBe(false);
  });

  it('flags a bad email and a non-Kenyan phone', () => {
    const { page } = setUp();
    page.contactEmail.set('jane@');
    page.contactPhone.set('12345');
    expect(page.emailError()).not.toBe('');
    expect(page.phoneError()).not.toBe('');
  });

  it('books the seats with tidy details and goes on to payment', async () => {
    const { page, navigate, drafts } = setUp();
    fillIn(page);

    await page.confirmBooking();

    expect(provider.createBooking).toHaveBeenCalledWith({
      trip: TRIP,
      boarding: { id: 'b1', name: 'Town', time: '08:00 AM' },
      dropping: { id: 'd1', name: 'Mombasa', time: '04:00 PM' },
      passengers: [
        {
          seatId: 's7',
          seatName: '7',
          seatType: 'normal',
          firstName: 'Jane',
          lastName: 'Wanjiku',
          gender: 'F',
          age: '34',
          nationality: 'Kenyan',
          idNumber: '12345678',
          price: 1500,
        },
        {
          seatId: 's1',
          seatName: '1',
          seatType: 'vip',
          firstName: 'Otieno',
          lastName: 'Ouma',
          gender: 'M',
          age: '41',
          nationality: 'Ugandan',
          idNumber: 'A1234567',
          price: 2200,
        },
      ],
      contact: { email: 'jane@example.com', phone: '254712345678' },
      totalAmount: 3700,
    });
    expect(drafts.current()?.hold).toEqual(HOLD);
    expect(navigate).toHaveBeenCalledWith(['/payment'], {
      queryParams: { busId: 'bus-1', seats: '7,1' },
    });
  });

  it('clears an old payment when booking again', async () => {
    const { page, drafts } = setUp(
      pickedDraft({ paymentReference: 'OLD-PAY', ticketNumber: 'OLD-TKT' }),
    );
    fillIn(page);

    await page.confirmBooking();

    expect(drafts.current()?.paymentReference).toBeUndefined();
    expect(drafts.current()?.ticketNumber).toBeUndefined();
  });

  it('shows the reason and stays on the page when the seats cannot be held', async () => {
    const { page, navigate } = setUp();
    provider.createBooking.mockRejectedValue(
      new TripApiError('Seat 7 was just taken.', 'SEAT_TAKEN', 409, null),
    );
    fillIn(page);

    await page.confirmBooking();

    expect(page.errorMessage()).toBe('Seat 7 was just taken.');
    expect(page.submitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('books only once when submitted twice quickly', async () => {
    const { page } = setUp();
    fillIn(page);

    await Promise.all([page.confirmBooking(), page.confirmBooking()]);

    expect(provider.createBooking).toHaveBeenCalledTimes(1);
  });
});
