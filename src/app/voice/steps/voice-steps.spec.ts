import { TripPassenger } from '../../models/booking.model';
import { LayoutSeat, StopPoint, Trip } from '../../models/trip.model';
import { DetailsVoiceStep } from './details-step';
import { PaymentPhase, PaymentVoiceStep } from './payment-step';
import { ResultsVoiceStep, findTrips } from './results-step';
import { SeatsVoiceStep, findSeatNames, seatClasses, seatRows } from './seats-step';

function trip(id: string, operator: string, departureHour: number, fromPrice: number): Trip {
  const hour12 = departureHour % 12 || 12;
  return {
    id,
    operator,
    departureHour,
    fromPrice,
    departureTime: `${hour12}:00 ${departureHour < 12 ? 'AM' : 'PM'}`,
  } as Trip;
}

const TRIPS = [trip('a', 'Dream Line', 7, 1500), trip('b', 'Coast Express', 21, 1800), trip('c', 'Dream Line', 14, 1200)];

function seat(name: string, taken = false): LayoutSeat {
  return { id: `id-${name}`, name, type: 'normal', typeLabel: 'Normal', status: taken ? 'taken' : 'available', price: 1700 } as LayoutSeat;
}

describe('findTrips', () => {
  it('picks by card number', () => {
    expect(findTrips('number two', TRIPS)).toEqual([TRIPS[1]]);
    expect(findTrips('the third one', TRIPS)).toEqual([TRIPS[2]]);
  });

  it('picks by price, time and operator', () => {
    expect(findTrips('the cheapest', TRIPS)).toEqual([TRIPS[2]]);
    expect(findTrips('earliest please', TRIPS)).toEqual([TRIPS[0]]);
    expect(findTrips('the 9 pm bus', TRIPS)).toEqual([TRIPS[1]]);
    expect(findTrips('coast express', TRIPS)).toEqual([TRIPS[1]]);
    expect(findTrips('dream line in the afternoon', TRIPS)).toEqual([TRIPS[2]]);
  });

  it('returns every bus an operator runs, and none for a number off the list', () => {
    expect(findTrips('dream line', TRIPS)).toEqual([TRIPS[0], TRIPS[2]]);
    expect(findTrips('number nine', TRIPS)).toEqual([]);
  });
});

describe('ResultsVoiceStep', () => {
  function setUp(trips = TRIPS) {
    const page = {
      highlighted: null as number | null,
      opened: undefined as Trip | undefined,
      date: '',
      loading: () => false,
      errorMessage: () => '',
      trips: () => trips,
      highlight(card: number | null) {
        page.highlighted = card;
      },
      openSeats(picked: Trip) {
        page.opened = picked;
      },
      changeDate(date: string) {
        page.date = date;
      },
    };
    return { page, step: new ResultsVoiceStep(page) };
  }

  it('asks before opening the seats of the bus that was picked', async () => {
    const { page, step } = setUp();
    expect(step.intro().text).toContain('I found 3 buses');

    const offer = await step.answer('number two');
    expect(offer?.text).toBe('Coast Express, 9:00 PM, from KES 1,800. Choose your seat?');
    expect(page.highlighted).toBe(2);
    expect(page.opened).toBeUndefined();

    expect(await step.answer('yes')).toBeNull();
    expect(page.opened).toBe(TRIPS[1]);
  });

  it('lets the user back out and pick again', async () => {
    const { page, step } = setUp();
    await step.answer('cheapest');
    await step.answer('Back');
    expect(page.highlighted).toBeNull();
    await step.answer('yes');
    expect(page.opened).toBeUndefined();
  });

  it('asks which one when several buses match', async () => {
    const { page, step } = setUp();
    const reply = await step.answer('dream line');
    expect(reply?.text).toContain('2 buses match: number 1, Dream Line at 7:00 AM; number 3, Dream Line at 2:00 PM');
    expect(page.highlighted).toBeNull();
  });

  it('leaves what it does not understand to the model, which acts through tools', async () => {
    const { page, step } = setUp();
    expect(await step.answer('something comfortable for my grandmother')).toBeUndefined();
    expect(step.unsure().text).toContain('Say a number from 1 to 3');

    const context = step.model.context() as { buses: { number: number; operator: string }[] };
    expect(context.buses.map((bus) => [bus.number, bus.operator])).toEqual([
      [1, 'Dream Line'],
      [2, 'Coast Express'],
      [3, 'Dream Line'],
    ]);

    expect(await step.model.runTool('mark_bus', { number: 3 })).toMatchObject({ ok: true, marked_bus: 3 });
    expect(page.highlighted).toBe(3);
    expect(step.model.prompts().confirm).toBe(true);

    expect(await step.model.runTool('open_seats', { number: 9 })).toHaveProperty('error');
    expect(await step.model.runTool('open_seats', { number: 3 })).toMatchObject({ ok: true, leaving: true });
    expect(page.opened).toBe(TRIPS[2]);
  });

  it('takes a date as a new search, not a bus number', async () => {
    const { page, step } = setUp();
    await step.answer('2 October 2030');
    expect(page.date).toBe('2030-10-02');
    expect(page.opened).toBeUndefined();
  });
});

describe('findSeatNames', () => {
  it('reads seat numbers and lettered seats', () => {
    expect(findSeatNames('seats five and 12', [seat('5'), seat('12')])).toEqual(['5', '12']);
    expect(findSeatNames('seat 3a', [seat('3A')])).toEqual(['3A']);
    expect(findSeatNames('two seats by the window', [seat('2')])).toEqual([]);
  });
});

describe('seatRows', () => {
  it('lists rows front to back with the aisle and taken seats marked', () => {
    // A bus lying on its side: each row is a column of four, split by an aisle.
    const at = (name: string, left: number, top: number, taken = false): LayoutSeat => ({
      ...seat(name, taken),
      left,
      top,
      width: 37,
      height: 36,
    });
    const seats = [
      at('5', 100, 0), at('6', 100, 53), at('7', 100, 192, true), at('8', 100, 252),
      at('1', 0, 0), at('2', 0, 53), at('3', 0, 192), at('4', 0, 252),
      at('9', 200, 0), at('10', 200, 53), at('11', 200, 192), at('12', 200, 252),
      at('13', 300, 0), at('14', 300, 53), at('15', 300, 192), at('16', 300, 252),
      at('17', 400, 0), at('18', 400, 54), at('19', 400, 120), at('20', 400, 196), at('21', 400, 252),
    ];
    expect(seatRows(seats)).toEqual(['1 2 _ 3 4', '5 6 _ 7x 8', '9 10 _ 11 12', '13 14 _ 15 16', '17 18 19 20 21']);
  });
});

describe('seatClasses', () => {
  it('lists the seats of each class, shortening runs of numbers', () => {
    const vip = (name: string): LayoutSeat => ({ ...seat(name), typeLabel: 'VIP' });
    expect(seatClasses([vip('1'), vip('2'), vip('3'), seat('4'), seat('5'), seat('7')])).toEqual({ VIP: '1-3', Normal: '4-5, 7' });
    expect(seatClasses([vip('1A'), vip('1B')])).toEqual({ VIP: '1A, 1B' });
  });
});

describe('SeatsVoiceStep', () => {
  const BOARDING: StopPoint[] = [
    { id: 'b1', name: 'Accra Road', time: '7:00 AM' },
    { id: 'b2', name: 'Westlands', time: '7:20 AM' },
  ];
  const DROPPING: StopPoint[] = [{ id: 'd1', name: 'Mwembe Tayari', time: '3:00 PM' }];

  function setUp(isGuest = false) {
    const seats = [seat('1'), seat('2'), seat('3', true), seat('4')];
    const state = { selected: [] as string[], boarding: '', dropping: 'd1', continued: false, closed: false };
    const step = new SeatsVoiceStep({
      trip: () => TRIPS[0],
      loading: () => false,
      errorMessage: () => '',
      seats: () => seats,
      selectedSeats: () => seats.filter((entry) => state.selected.includes(entry.id)),
      totalPrice: () => state.selected.length * 1700,
      maxSeats: 2,
      isGuest: () => isGuest,
      boardingPoints: () => BOARDING,
      droppingPoints: () => DROPPING,
      boarding: () => BOARDING.find((point) => point.id === state.boarding),
      dropping: () => DROPPING.find((point) => point.id === state.dropping),
      setSelected: (ids) => (state.selected = ids),
      setBoarding: (id) => (state.boarding = id),
      setDropping: (id) => (state.dropping = id),
      continue: () => (state.continued = true),
      close: () => (state.closed = true),
    });
    return { state, step };
  }

  it('walks from seat to stop to continue', async () => {
    const { state, step } = setUp();
    expect(step.intro().text).toBe('Dream Line, 7:00 AM. 3 seats are free, from KES 1,700. Which seat would you like?');

    expect((await step.answer('seat two'))?.text).toBe('Seat 2, KES 1,700. Where will you board?');
    expect(state.selected).toEqual(['id-2']);

    const confirm = await step.answer('westlands');
    expect(state.boarding).toBe('b2');
    expect(confirm?.text).toBe('Seat 2, Westlands to Mwembe Tayari, KES 1,700 in total. Continue to passenger details?');

    expect(await step.answer('yes')).toBeNull();
    expect(state.continued).toBe(true);
  });

  it('refuses taken and unknown seats', async () => {
    const { state, step } = setUp();
    expect((await step.answer('seat 3'))?.text).toBe('Seat 3 is taken. Which seat would you like?');
    expect((await step.answer('seat 40'))?.text).toBe('There is no seat 40 on this bus. Which seat would you like?');
    expect(state.selected).toEqual([]);
  });

  it('keeps to the seat limit, and to one seat for a guest', async () => {
    const full = setUp();
    const reply = await full.step.answer('seats 1, 2 and 4');
    expect(full.state.selected).toEqual(['id-1', 'id-2']);
    expect(reply?.text).toContain('You can book up to 2 seats at a time.');

    const guest = setUp(true);
    await guest.step.answer('seat 1');
    await guest.step.answer('seat 4');
    expect(guest.state.selected).toEqual(['id-4']);
  });

  it('lets the model pick seats and stops, and checks each one', async () => {
    const { state, step } = setUp();
    expect(await step.answer('two seats together by the window please')).toBeUndefined();

    const picked = await step.model.runTool('select_seats', { seats: ['1', '3', '2', '4'] });
    expect(state.selected).toEqual(['id-1', 'id-2']);
    expect(picked).toMatchObject({
      selected_seats: [
        { seat: '1', class: 'Normal', fare_kes: 1700 },
        { seat: '2', class: 'Normal', fare_kes: 1700 },
      ],
      total_kes: 3400,
      still_needed: ['boarding point'],
    });
    expect(picked['problems']).toEqual(['Seat 3 is taken.', 'At most 2 seats can be booked at a time.']);

    expect(await step.model.runTool('continue_to_details', {})).toMatchObject({ ok: false });
    expect(state.continued).toBe(false);

    expect(await step.model.runTool('set_stops', { boarding: 'Accra Road', drop_off: 'Nowhere' })).toMatchObject({
      boarding: 'Accra Road',
      problems: ['Nowhere is not one of the drop-off points.'],
    });
    expect(await step.model.runTool('continue_to_details', {})).toMatchObject({ ok: true, leaving: true });
    expect(state.continued).toBe(true);
  });

  it('removes a seat and goes back to the buses', async () => {
    const { state, step } = setUp();
    await step.answer('seats 1 and 2');
    await step.answer('remove seat 1');
    expect(state.selected).toEqual(['id-2']);

    expect(await step.answer('back')).toBeNull();
    expect(state.closed).toBe(true);
  });
});

describe('DetailsVoiceStep', () => {
  function setUp(passengerCount = 1, email = '', phone = '') {
    const state = {
      passengers: Array.from(
        { length: passengerCount },
        (_, index): TripPassenger => ({ seatName: String(index + 5), seatType: 'normal', fullName: '', idNumber: '', price: 1700 }),
      ),
      email,
      phone,
      reserved: 0,
      error: '',
    };
    const step = new DetailsVoiceStep({
      passengers: () => state.passengers,
      setPassenger: (index, field, value) => (state.passengers[index] = { ...state.passengers[index], [field]: value }),
      email: () => state.email,
      setEmail: (value) => (state.email = value),
      phone: () => state.phone,
      setPhone: (value) => (state.phone = value),
      totalPrice: () => passengerCount * 1700,
      holdMinutes: 10,
      reserve: async () => {
        state.reserved++;
      },
      errorMessage: () => state.error,
    });
    return { state, step };
  }

  it('asks for each detail in turn, then reserves on yes', async () => {
    const { state, step } = setUp();
    expect(step.intro().text).toBe("I need a few details for the ticket. What is the passenger's full name?");
    expect((await step.answer('my name is john kamau'))?.text).toBe('What is the ID or passport number?');
    expect(step.patient()).toBe(true);
    const afterId = await step.answer('12 34 56 78');
    expect(afterId?.text).toBe('ID 12345678. Which email address should the ticket go to?');
    expect(afterId?.say).toContain('I D 1 2 3 4 5 6 7 8.');
    expect((await step.answer('john at gmail dot com'))?.text).toBe('john@gmail.com. What is your mobile number?');

    const confirm = await step.answer('zero seven one two 345 678');
    expect(confirm?.text).toBe(
      '0712 345 678. All set: John Kamau, seat 5, KES 1,700 in total. Reserve for 10 minutes and go to payment?',
    );
    expect(step.patient()).toBe(false);
    expect(state.passengers[0]).toMatchObject({ fullName: 'John Kamau', idNumber: '12345678' });
    expect(state.email).toBe('john@gmail.com');
    expect(state.phone).toBe('0712 345 678');
    expect(state.reserved).toBe(0);

    expect(await step.answer('yes')).toBeNull();
    expect(state.reserved).toBe(1);
  });

  it('keeps a number that came in pieces and asks for the rest', async () => {
    const { state, step } = setUp();
    await step.answer('Jane Wanjiru');
    const part = await step.answer('one two three four');
    expect(part?.text).toBe('I have 1234 so far. Say the rest, or say start over.');
    expect(state.passengers[0].idNumber).toBe('');

    expect((await step.answer('five six seven eight'))?.text).toContain('ID 12345678.');
    expect(state.passengers[0].idNumber).toBe('12345678');
  });

  it('starts a number over on request, and takes it whole when said again in full', async () => {
    const { state, step } = setUp(1, 'jane@example.com');
    await step.answer('Jane Wanjiru');
    await step.answer('99');
    expect((await step.answer('start over'))?.text).toBe('What is the ID or passport number?');
    await step.answer('12345678');
    expect(state.passengers[0].idNumber).toBe('12345678');

    await step.answer('0712');
    await step.answer('0712 345 678');
    expect(state.phone).toBe('0712 345 678');
  });

  it('skips details that are already filled in and names the seat when there are several', async () => {
    const { step } = setUp(2, 'jane@example.com', '0712345678');
    expect(step.intro().text).toContain("What is the passenger's full name for seat 5?");
    await step.answer('Jane Wanjiru');
    await step.answer('12345678');
    expect((await step.answer('Peter Otieno'))?.text).toBe('What is the ID or passport number for seat 6?');
    expect((await step.answer('A1234567'))?.text).toContain('All set: 2 passengers, seats 5, 6');
  });

  it('changes one detail on request and reports a failed reservation', async () => {
    const { state, step } = setUp(1, 'jane@example.com', '0712345678');
    await step.answer('Jane Wanjiru');
    await step.answer('12345678');

    expect((await step.answer('Edit'))?.text).toContain('What would you like to change?');
    expect((await step.answer('email'))?.text).toBe('Which email address should the ticket go to?');
    await step.answer('jane at work dot co dot ke');
    expect(state.email).toBe('jane@work.co.ke');

    state.error = 'Seat 5 was just taken.';
    expect((await step.answer('reserve seats'))?.text).toBe('Seat 5 was just taken. Shall I try again?');
  });
});

describe('PaymentVoiceStep', () => {
  function setUp(phone = '0712345678') {
    const state = { phase: 'ready' as PaymentPhase, phone, paid: 0, checked: 0, back: 0 };
    const step = new PaymentVoiceStep({
      payable: () => true,
      phase: () => state.phase,
      phone: () => state.phone,
      setPhone: (value) => (state.phone = value),
      totalPrice: () => 1700,
      remainingSeconds: () => 540,
      errorMessage: () => '',
      pay: () => state.paid++,
      checkAgain: () => state.checked++,
      backToSeats: () => state.back++,
    });
    return { state, step };
  }

  it('reads the amount and number back, and pays only on the word pay', async () => {
    const { state, step } = setUp();
    const intro = step.intro();
    expect(intro?.text).toBe(
      'Your seats are held for 9 more minutes. The total is KES 1,700, on M-Pesa number 0712 345 678. Say pay to send the request.',
    );
    expect(intro?.say).toContain('0 7 1 2 3 4 5 6 7 8');

    expect((await step.answer('yes'))?.text).toBe('To send the M-Pesa request, say pay, or tap the button.');
    await step.answer('okay sure');
    await step.answer('no');
    expect(state.paid).toBe(0);

    expect(await step.answer('pay now')).toBeNull();
    expect(state.paid).toBe(1);
  });

  it('needs the word pay after a failed payment too', async () => {
    const { state, step } = setUp();
    state.phase = 'rejected';
    expect(step.intro()?.text).toBe('The payment did not go through. Say pay to try again.');
    await step.answer('yes');
    expect(state.paid).toBe(0);
    await step.answer('Try again');
    expect(state.paid).toBe(1);
  });

  it('takes a new number and asks again before paying', async () => {
    const { state, step } = setUp('');
    expect(step.intro()?.text).toContain('Which M-Pesa number');
    const reply = await step.answer('zero seven two two 111 222');
    expect(state.phone).toBe('0722 111 222');
    expect(reply?.text).toContain('on M-Pesa number 0722 111 222. Say pay to send the request.');
    expect(state.paid).toBe(0);
  });

  it('checks rather than pays again after a timeout, and never pays while waiting', async () => {
    const { state, step } = setUp();
    state.phase = 'awaiting';
    await step.answer('yes');
    expect(state.paid).toBe(0);

    state.phase = 'timeout';
    step.intro();
    expect(await step.answer('yes')).toBeNull();
    expect(state).toMatchObject({ paid: 0, checked: 1 });
    await step.answer('Pay again');
    expect(state.paid).toBe(1);
  });

  it('goes back to the seats once the hold has run out', async () => {
    const { state, step } = setUp();
    state.phase = 'expired';
    await step.answer('yes');
    expect(state).toMatchObject({ paid: 0, back: 1 });
  });
});
