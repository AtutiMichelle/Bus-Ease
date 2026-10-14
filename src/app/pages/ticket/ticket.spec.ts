import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Ticket } from './ticket';
import { BookingDraft, BookingDraftService } from '../../services/booking-draft.service';
import { TRIP_PROVIDER } from '../../trips/trip-provider.token';
import { TripProvider } from '../../trips/trip-provider';
import { Trip } from '../../models/trip.model';

const PAID: BookingDraft = {
  trip: { id: 'bus-1', from: 'Nairobi', to: 'Mombasa', date: '2026-10-20' } as Trip,
  seats: [
    { id: 's7', name: '7', type: 'normal', typeLabel: 'Normal', price: 1500 },
    { id: 's8', name: '8', type: 'normal', typeLabel: 'Normal', price: 1500 },
  ],
  boarding: { id: 'b1', name: 'Town', time: '08:00 AM' },
  dropping: { id: 'd1', name: 'Mombasa', time: '04:00 PM' },
  hold: {
    reference: 'HOLD-1',
    status: 'paid',
    totalAmount: 3000,
    currency: 'KES',
    heldUntil: '2026-10-20T08:10:00Z',
  },
  ticketNumber: 'TKT-9',
};

describe('Ticket', () => {
  let provider: { getPrintableTicket: ReturnType<typeof vi.fn> };
  let tab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };

  function setUp(params: Record<string, string>, draft: BookingDraft | undefined = PAID) {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
    });
    if (draft) {
      TestBed.inject(BookingDraftService).set(draft);
    }
    return TestBed.createComponent(Ticket).componentInstance;
  }

  beforeEach(() => {
    sessionStorage.clear();
    provider = {
      getPrintableTicket: vi
        .fn()
        .mockResolvedValue({ ticketNumber: 'TKT-9', url: 'https://tickets.example/TKT-9.pdf' }),
    };
    tab = { opener: window, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
    TestBed.configureTestingModule({
      imports: [Ticket],
      providers: [
        provideRouter([]),
        { provide: TRIP_PROVIDER, useValue: provider as unknown as TripProvider },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the booking this tab paid for', () => {
    const page = setUp({ ticket: 'TKT-9' });
    expect(page.booking()).toBeDefined();
    expect(page.seatList()).toBe('7, 8');
    expect(page.totalPaid()).toBe(3000);
  });

  it('finds the booking by its reference too', () => {
    const page = setUp({ reference: 'HOLD-1' });
    expect(page.booking()).toBeDefined();
  });

  it('does not show details from a different booking', () => {
    const page = setUp({ ticket: 'SOMEONE-ELSE' });
    expect(page.booking()).toBeUndefined();
    expect(page.totalPaid()).toBe(0);
  });

  it('opens the printable ticket in a new tab, cut off from this page', async () => {
    const page = setUp({ ticket: 'TKT-9' });
    await page.print();

    expect(provider.getPrintableTicket).toHaveBeenCalledWith('TKT-9');
    expect(tab.location.href).toBe('https://tickets.example/TKT-9.pdf');
    expect(tab.opener).toBeNull();
    expect(page.printFallback()).toBe(false);
    expect(page.printing()).toBe(false);
  });

  it('keeps the details on screen when the source has no printable ticket', async () => {
    provider.getPrintableTicket.mockResolvedValue({ ticketNumber: 'TKT-9', url: '' });
    const page = setUp({ ticket: 'TKT-9' });
    await page.print();

    expect(tab.close).toHaveBeenCalled();
    expect(page.printFallback()).toBe(true);
  });

  it('does not open a link that is not a web address', async () => {
    provider.getPrintableTicket.mockResolvedValue({
      ticketNumber: 'TKT-9',
      url: 'javascript:alert(1)',
    });
    const page = setUp({ ticket: 'TKT-9' });
    await page.print();

    expect(tab.location.href).toBe('');
    expect(page.printFallback()).toBe(true);
  });

  it('falls back when the ticket address cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const page = setUp({ ticket: 'TKT-9' });
    await page.print();

    expect(tab.close).toHaveBeenCalled();
    expect(page.printFallback()).toBe(true);
  });

  it('falls back without asking when there is no ticket number', async () => {
    const page = setUp({ reference: 'HOLD-1' });
    await page.print();

    expect(provider.getPrintableTicket).not.toHaveBeenCalled();
    expect(page.printFallback()).toBe(true);
  });
});
