import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Payment } from './payment';
import { BookingDraft, BookingDraftService } from '../../services/booking-draft.service';
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

/** A booking held for `minutes` from now, ready to pay. */
function heldDraft(minutes = 10): BookingDraft {
  return {
    trip: TRIP,
    seats: [{ id: 's7', name: '7', type: 'normal', typeLabel: 'Normal', price: 1500 }],
    boarding: { id: 'b1', name: 'Town', time: '08:00 AM' },
    dropping: { id: 'd1', name: 'Mombasa', time: '04:00 PM' },
    contact: { email: 'jane@example.com', phone: '254712345678' },
    hold: {
      reference: 'HOLD-1',
      status: 'held',
      totalAmount: 1500,
      currency: 'KES',
      heldUntil: new Date(Date.now() + minutes * 60_000).toISOString(),
    },
  };
}

describe('Payment', () => {
  let provider: {
    holdMinutes: number;
    startMpesaPayment: ReturnType<typeof vi.fn>;
    checkMpesaPayment: ReturnType<typeof vi.fn>;
  };

  function setUp(draft: BookingDraft = heldDraft()) {
    TestBed.inject(BookingDraftService).set(draft);
    const fixture = TestBed.createComponent(Payment);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return {
      page: fixture.componentInstance,
      navigate,
      drafts: TestBed.inject(BookingDraftService),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    provider = {
      holdMinutes: 10,
      startMpesaPayment: vi.fn().mockResolvedValue({ reference: 'PAY-1', status: 'sent' }),
      checkMpesaPayment: vi.fn().mockResolvedValue({ reference: 'PAY-1', state: 'pending' }),
    };
    TestBed.configureTestingModule({
      imports: [Payment],
      providers: [
        provideRouter([]),
        { provide: TRIP_PROVIDER, useValue: provider as unknown as TripProvider },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('fills in the contact phone the way people write it locally', () => {
    const { page } = setUp();
    expect(page.phone()).toBe('0712345678');
  });

  it('sends the prompt for the held booking and its total', async () => {
    const { page, drafts } = setUp();
    await page.pay();

    expect(provider.startMpesaPayment).toHaveBeenCalledWith('HOLD-1', '254712345678', 1500);
    expect(page.phase()).toBe('awaiting');
    expect(drafts.current()?.paymentReference).toBe('PAY-1');
  });

  it('opens the ticket once the payment goes through', async () => {
    const { page, navigate, drafts } = setUp();
    provider.checkMpesaPayment.mockResolvedValue({
      reference: 'PAY-1',
      state: 'success',
      ticketNumber: 'TKT-9',
    });

    await page.pay();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(drafts.current()?.ticketNumber).toBe('TKT-9');
    expect(navigate).toHaveBeenCalledWith(
      ['/ticket'],
      expect.objectContaining({ queryParams: expect.objectContaining({ ticket: 'TKT-9' }) }),
    );
  });

  it('keeps the booking reference the source gives once paid', async () => {
    const { page, drafts } = setUp();
    provider.checkMpesaPayment.mockResolvedValue({
      reference: 'PAY-1',
      state: 'success',
      ticketNumber: 'TKT-9',
      bookingReference: 'FINAL-1',
    });

    await page.pay();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(drafts.current()?.hold?.reference).toBe('FINAL-1');
  });

  it('says so when the payment is declined', async () => {
    const { page, navigate } = setUp();
    provider.checkMpesaPayment.mockResolvedValue({ reference: 'PAY-1', state: 'rejected' });

    await page.pay();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(page.phase()).toBe('rejected');
    expect(page.errorMessage()).toContain('declined');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps checking through a dropped connection', async () => {
    const { page } = setUp();
    provider.checkMpesaPayment
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ reference: 'PAY-1', state: 'success', ticketNumber: 'TKT-9' });

    await page.pay();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(page.phase()).toBe('awaiting');

    await vi.advanceTimersByTimeAsync(3_000);
    expect(provider.checkMpesaPayment).toHaveBeenCalledTimes(2);
  });

  it('stops waiting after 90 seconds, then can check once more', async () => {
    const { page } = setUp();
    await page.pay();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(page.phase()).toBe('timeout');

    const checks = provider.checkMpesaPayment.mock.calls.length;
    provider.checkMpesaPayment.mockResolvedValue({
      reference: 'PAY-1',
      state: 'success',
      ticketNumber: 'TKT-9',
    });
    await page.checkAgain();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(provider.checkMpesaPayment).toHaveBeenCalledTimes(checks + 1);
    expect(provider.checkMpesaPayment).toHaveBeenLastCalledWith('PAY-1');
  });

  it('shows the error when the prompt cannot be sent', async () => {
    const { page } = setUp();
    provider.startMpesaPayment.mockRejectedValue(
      new TripApiError('M-Pesa is busy, try again.', 'UPSTREAM_TIMEOUT', 504, null),
    );

    await page.pay();

    expect(page.phase()).toBe('error');
    expect(page.errorMessage()).toBe('M-Pesa is busy, try again.');
  });

  it('treats a declined start as declined, not as a fault', async () => {
    const { page } = setUp();
    provider.startMpesaPayment.mockRejectedValue(
      new TripApiError('Declined.', 'PAYMENT_REJECTED', 400, null),
    );

    await page.pay();

    expect(page.phase()).toBe('rejected');
  });

  it('does not send a prompt to a number that is not Kenyan mobile', async () => {
    const { page } = setUp();
    page.phone.set('12345');

    await page.pay();

    expect(provider.startMpesaPayment).not.toHaveBeenCalled();
    expect(page.phoneError()).not.toBe('');
  });

  it('does not take payment once the hold has run out', async () => {
    const { page } = setUp(heldDraft(1));
    await vi.advanceTimersByTimeAsync(61_000);

    expect(page.phase()).toBe('expired');
    await page.pay();
    expect(provider.startMpesaPayment).not.toHaveBeenCalled();
  });

  it('ignores a late answer from an earlier attempt', async () => {
    const { page, navigate } = setUp();
    let finishFirst: (value: unknown) => void = () => {};
    provider.startMpesaPayment.mockReturnValueOnce(
      new Promise((resolve) => (finishFirst = resolve)),
    );

    const first = page.pay();
    page.phase.set('error');
    await page.pay();
    finishFirst({ reference: 'OLD', status: 'sent' });
    await first;
    await vi.advanceTimersByTimeAsync(3_000);

    expect(provider.checkMpesaPayment).not.toHaveBeenCalledWith('OLD');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes back to the seat map with the same trip after a lapsed hold', () => {
    const { page, navigate, drafts } = setUp();
    page.backToSeatSelection();

    expect(drafts.current()).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(
      ['/results'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ busId: 'bus-1', originId: '1' }),
      }),
    );
  });
});
