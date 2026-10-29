// supabase/functions/travler/rules.ts
//
// What the travler function accepts and how often, one entry per endpoint.
// Kept apart from index.ts and free of Deno APIs so it can be checked on its
// own.
//
// Request bodies are rebuilt from the fields listed here: anything else the
// caller sends is dropped, and a missing or wrong-shaped field is refused
// before Travler is called. The shapes match what BusEase sends (see
// src/app/trips/providers/travler/travler.types.ts). A new field has to be
// added here before it reaches Travler.
//
// BusEase sells one operator's trips (Coast Bus). Which one is a setting,
// not something the browser sends: `fixed` adds the operator and the
// fields every call needs, and `reply` drops any other operator's buses
// from search results.

const INVALID = Symbol('invalid');
type Field = (value: unknown) => unknown;
type Schema = Record<string, Field>;

export type Validation = { ok: true; body: Record<string, unknown> } | { ok: false; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(maxLength: number, pattern?: RegExp): Field {
  return (value) =>
    typeof value === 'string' && value.length > 0 && value.length <= maxLength && (!pattern || pattern.test(value))
      ? value
      : INVALID;
}

/** Travler ids arrive as strings or numbers depending on the endpoint. */
const id: Field = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : INVALID;
  }
  return text(64, /^[\w.:-]+$/)(value);
};

const date = text(10, /^\d{4}-\d{2}-\d{2}$/);
/** 2547XXXXXXXX or 2541XXXXXXXX, the form normalizeKenyanPhone produces. */
const phone = text(12, /^254[17]\d{8}$/);
const email = text(254, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);

function oneOf(...allowed: unknown[]): Field {
  return (value) => (allowed.includes(value) ? value : INVALID);
}

function integer(min: number, max: number): Field {
  return (value) => (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : INVALID);
}

function object(schema: Schema): Field {
  return (value) => {
    const result = clean(schema, value);
    return result.ok ? result.body : INVALID;
  };
}

function list(item: Field, min: number, max: number): Field {
  return (value) => {
    if (!Array.isArray(value) || value.length < min || value.length > max) {
      return INVALID;
    }
    const items = value.map(item);
    return items.includes(INVALID) ? INVALID : items;
  };
}

function clean(schema: Schema, value: unknown): Validation {
  if (!isPlainObject(value)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const body: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    const cleaned = field(value[key]);
    if (cleaned === INVALID) {
      return { ok: false, message: `"${key}" is missing or not valid` };
    }
    body[key] = cleaned;
  }
  return { ok: true, body };
}

/** Counts calls against `max` per `windowSeconds`. 'ip' counts per caller
 * address, 'phone' per phone number in the request. */
export interface Limit {
  scope: 'ip' | 'phone';
  max: number;
  windowSeconds: number;
}

/** Settings the function reads from its secrets and hands to the rules. */
export interface UpstreamConfig {
  /** Travler's company id for the one operator BusEase sells, e.g. "34". */
  companyId: string;
}

/** Calls another Travler endpoint from inside the function, with that
 * endpoint's fixed fields added. Answers with Travler's JSON body as-is. */
export type Lookup = (path: string, body: Record<string, unknown>) => Promise<unknown>;

export type Prepared =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string; code: string; status: number };

export interface Endpoint {
  schema: Schema;
  /** Fields the function adds to the checked body itself. They win over
   * anything the caller sent under the same name. */
  fixed?: (config: UpstreamConfig) => Record<string, unknown>;
  /** Builds the whole body Travler gets, in place of `fixed`, from the
   * checked body plus what it looks up from Travler itself. */
  prepare?: (body: Record<string, unknown>, config: UpstreamConfig, lookup: Lookup) => Promise<Prepared>;
  /** Changes Travler's answer before it goes back to the browser. */
  reply?: (body: unknown, config: UpstreamConfig) => unknown;
  limits: Limit[];
  /** The body field holding the phone number, for 'phone' limits. */
  phoneField?: string;
  /** What to do when the rate limiter itself can't be reached. Endpoints
   * that hold seats or send payment prompts refuse the call; the read-only
   * ones let it through, so a limiter hiccup doesn't take search down. */
  refuseWithoutLimiter: boolean;
}

// The per-address limits are loose on purpose. Mobile networks put many
// customers behind one shared address, so a tight limit there would block
// real people. The tight limits are the per-phone ones.
const MINUTE = 60;
const TEN_MINUTES = 600;

const paymentLeg = object({ sponsorTrip: oneOf(false), discountId: integer(0, 0) });

/** Travler's delay markers, copied from the search result. */
const delayedFlag = integer(0, 9);
const delayedDate = integer(0, 99_999_999_999);

const WEB = { sourcetype: 'web' };

/** Every search filter Travler expects, left open, as in the API guide.
 * Travler answers with an HTML error page when any of them is missing. */
const SEARCH_DEFAULTS = {
  avg_rating: null,
  departure_time: 'asc',
  fare: null,
  seat_type: '',
  travels: '',
  boarding_points: [],
  dropping_points: [],
  bus_with_amenities: [],
  high_rating: true,
  bus_with_live_tracking: false,
  cabs: false,
  hot_deals: false,
  on_time: false,
  bus_type: [],
  time_range: [],
  record_type: 'data',
  currencyId: '1',
  delayBus: true,
  ...WEB,
};

/** Keeps only the operator's own buses, and takes out each bus's operator
 * token: the browser has no use for it, and booking adds it server-side. */
function onlyOperatorBuses(body: unknown, config: UpstreamConfig): unknown {
  if (!isPlainObject(body) || !Array.isArray(body.data)) {
    return body;
  }
  const data = body.data
    .filter((bus) => isPlainObject(bus) && String(bus.company_id) === config.companyId)
    .map(({ token: _token, ...bus }) => bus);
  return { ...body, data, available_buses_count: data.length };
}

/** Travler city ids each operator runs between, by company id. getCity
 * takes no operator and lists every town on Travler, so the city lists are
 * cut down to these. Coast Bus (34) found by live search on 2026-10-28:
 * every pair of these towns had a bus. An operator not listed here gets
 * Travler's full list. */
const OPERATOR_TOWNS: Record<string, string[]> = {
  // Bungoma, Chavakali, Kakamega, Kericho, Kisumu, Malaba, Mombasa, Mumias,
  // Nairobi, Nakuru, Voi
  '34': ['14', '271', '270', '228', '10', '7', '13', '272', '3', '15', '39'],
};

/** Travler's currency id for Kenyan shillings, the one SEARCH_DEFAULTS asks for. */
const KES_ID = '1';

/** Seat map cells nobody can buy. */
const NOT_FOR_SALE = new Set(['driver', 'door', 'staff']);

function refuse(message: string, code: string, status: number): Prepared {
  return { ok: false, message, code, status };
}

function money(value: number): string {
  return value.toFixed(2);
}

/** Builds Travler's Create Booking body (section 4.6 of the API guide).
 * The browser sends only what the customer picked and typed. The trip token,
 * route, times, delay markers and prices come from Travler's own search and
 * seat layout, looked up here: the token never reaches the browser, and the
 * customer can't change what a seat costs. */
async function prepareBooking(body: Record<string, unknown>, config: UpstreamConfig, lookup: Lookup): Promise<Prepared> {
  const route = { source_city_id: body.pickup_id, destination_city_id: body.return_id, travel_date: body.booking_date };

  const search = await lookup('/Trips/filterBuses', route);
  const buses = isPlainObject(search) && Array.isArray(search.data) ? search.data : [];
  const bus = buses.find(
    (item) => isPlainObject(item) && String(item.bus_id) === String(body.bus_id) && String(item.company_id) === config.companyId,
  );
  if (!isPlainObject(bus) || typeof bus.token !== 'string' || !bus.token) {
    return refuse('This bus is no longer taking bookings. Please search again.', 'TRIP_UNAVAILABLE', 409);
  }
  const delayedFlag = Number(bus.delayedFlag) || 0;
  const delayedDate = Number(bus.delayedDate) || 0;

  const layout = await lookup('/trips/getTripSeatsPrice', { ...route, bus_id: body.bus_id, delayedFlag, delayedDate });
  const seats = isPlainObject(layout) && Array.isArray(layout.data) ? layout.data.filter(isPlainObject) : [];
  const priceList = isPlainObject(layout) && isPlainObject(layout.priceList) ? layout.priceList : {};

  const wanted = body.passenger as Record<string, unknown>[];
  if (new Set(wanted.map((p) => String(p.seat_id))).size !== wanted.length) {
    return refuse('Each passenger needs a different seat.', 'VALIDATION_ERROR', 400);
  }

  let subTotal = 0;
  let tax = 0;
  const passenger: Record<string, unknown>[] = [];
  for (const p of wanted) {
    const seat = seats.find((s) => String(s.seat_id) === String(p.seat_id));
    const type = String(seat?.seat_type ?? '').trim();
    if (!seat || NOT_FOR_SALE.has(type.toLowerCase())) {
      return refuse("One of the chosen seats can't be booked. Please pick your seats again.", 'INVALID_SEAT', 422);
    }
    const seatName = String(seat.seat_name ?? '').trim();
    if (seat.selection_status === true) {
      return refuse(`Seat ${seatName} has just been taken. Please pick another seat.`, 'SEAT_UNAVAILABLE', 409);
    }
    const prices = priceList[type] ?? priceList[type.toLowerCase()];
    const entry = Array.isArray(prices) ? prices.find((e) => isPlainObject(e) && String(e.currencyId) === KES_ID) : undefined;
    const price = isPlainObject(entry) ? Number(entry.price) : NaN;
    if (!Number.isFinite(price) || price <= 0) {
      return refuse(`Seat ${seatName} has no price yet. Please pick another seat.`, 'INVALID_SEAT', 422);
    }
    subTotal += price;
    tax += Number(isPlainObject(entry) ? entry.tax : 0) || 0;
    passenger.push({
      seat_id: String(seat.seat_id),
      seat_name: seatName,
      seat_type: type,
      ticketPrice: money(price),
      flatTicketPrice: money(price),
      currency: 'KES',
      flat_sale: 0,
      name: p.name,
      last_name: p.last_name,
      gender: p.gender,
      age: p.age,
      mobileId: p.mobileId,
      mobile: p.mobile,
      nationality: p.nationality,
      id_no: p.id_no,
      email: p.email,
    });
  }

  const operator = String(bus.company_name ?? '').trim();
  const onwardticket = {
    booking_date: body.booking_date,
    route_id: String(bus.route_id),
    token: bus.token,
    pickup_id: body.pickup_id,
    return_id: body.return_id,
    source_city: body.source_city,
    dest_city: body.dest_city,
    bus_title: operator,
    company_logo: String(bus.company_logo ?? ''),
    company_name: operator,
    currency: 'KES',
    departure_time: String(bus.departure_time ?? ''),
    boardingPointId: body.boardingPointId,
    droppingPointId: body.droppingPointId,
    boardingPointname: body.boardingPointname,
    droppingPointname: body.droppingPointname,
    bus_id: String(body.bus_id),
    currencyId: KES_ID,
    ticket_cnt: passenger.length,
    bs_number_of_seats: seats.filter((s) => !['driver', 'door'].includes(String(s.seat_type ?? '').trim().toLowerCase())).length,
    // The guide's example sends "f" and doesn't say what else it can be.
    available_Seats: 'f',
    sub_total: subTotal,
    tax: money(tax),
    total: subTotal + tax,
    is_luggage: false,
    c_address: '',
    c_city: '',
    c_state: '',
    c_zip: '',
    c_country: '',
    is_flat_offer: false,
    passenger,
    isPromotional: bus.isPromotional === true,
    promotionalTripMsg: '',
    seatSelectionLimit: String(bus.seatSelectionLimit ?? '0'),
    delayedFlag,
    delayedDate,
    c_email: body.c_email,
    selectedSeat: passenger.map((p) => p.seat_id),
    insuranceId: '',
    insuranceAmount: 0,
    insurancePlanName: '',
  };
  return { ok: true, body: { ticketDetail: { onwardticket, returnticket: {}, bookedThrough: 'web' }, ...WEB } };
}

/** Keeps only the towns the operator runs to, sorted by name. */
function onlyOperatorTowns(body: unknown, config: UpstreamConfig): unknown {
  const towns = OPERATOR_TOWNS[config.companyId];
  if (!towns || !isPlainObject(body) || !Array.isArray(body.data)) {
    return body;
  }
  const data = body.data
    .filter((city) => isPlainObject(city) && towns.includes(String(city.id)))
    .sort((a, b) => String(a.city_name).trim().localeCompare(String(b.city_name).trim()));
  return { ...body, data };
}

// Paths are case sensitive and deliberately inconsistent: they match the API as-is.
export const ENDPOINTS: Record<string, Endpoint> = {
  '/common/getCity': {
    // city_id is 0 for the list of source cities.
    schema: { city_id: id, city_type: oneOf('source', 'destination') },
    fixed: () => WEB,
    reply: onlyOperatorTowns,
    limits: [{ scope: 'ip', max: 120, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/Trips/filterBuses': {
    schema: { source_city_id: id, destination_city_id: id, travel_date: date },
    fixed: (config) => ({ ...SEARCH_DEFAULTS, company_id: [config.companyId] }),
    reply: onlyOperatorBuses,
    limits: [{ scope: 'ip', max: 60, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/trips/getTripSeatsPrice': {
    schema: { source_city_id: id, destination_city_id: id, travel_date: date, bus_id: id, delayedFlag, delayedDate },
    fixed: () => WEB,
    limits: [{ scope: 'ip', max: 120, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/trips/getBoardingDroppingPoints': {
    schema: { source: id, destination: id, trip: id, booking_date: date, delayedFlag, delayedDate },
    fixed: () => WEB,
    limits: [{ scope: 'ip', max: 120, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/Ticket/RoundBooking': {
    schema: {
      bus_id: id,
      booking_date: date,
      pickup_id: id,
      return_id: id,
      source_city: text(60),
      dest_city: text(60),
      boardingPointId: id,
      droppingPointId: id,
      boardingPointname: text(120),
      droppingPointname: text(120),
      passenger: list(
        object({
          seat_id: id,
          name: text(50),
          last_name: text(50),
          gender: oneOf('M', 'F'),
          age: text(3, /^\d{1,3}$/),
          mobileId: oneOf('254'),
          mobile: text(9, /^[17]\d{8}$/),
          nationality: text(40),
          id_no: text(20, /^[A-Za-z0-9]{5,20}$/),
          email,
        }),
        1,
        6,
      ),
      c_email: email,
      // Only for the per-phone limit below; Travler takes each passenger's mobile instead.
      contact_phone: phone,
    },
    prepare: prepareBooking,
    limits: [
      { scope: 'phone', max: 5, windowSeconds: TEN_MINUTES },
      { scope: 'ip', max: 30, windowSeconds: TEN_MINUTES },
    ],
    phoneField: 'contact_phone',
    refuseWithoutLimiter: true,
  },
  '/paymentGateway/init': {
    schema: {
      bookingRef: text(64),
      // 2: queryvalue is a phone number.
      queryoption: oneOf(2),
      queryvalue: phone,
      requestType: oneOf('ticket'),
      // Wallet payment isn't offered yet, so only `false` goes through.
      isWalletApply: oneOf(false),
      // No sponsored trips or discounts yet, so both legs are always the defaults.
      additionalInfo: object({ onward: paymentLeg, return: paymentLeg }),
      paymentMethod: oneOf('mpesa'),
    },
    fixed: () => WEB,
    limits: [
      { scope: 'phone', max: 5, windowSeconds: TEN_MINUTES },
      { scope: 'ip', max: 30, windowSeconds: TEN_MINUTES },
    ],
    phoneField: 'queryvalue',
    refuseWithoutLimiter: true,
  },
  '/paymentGateway/checkMpesaPayment': {
    schema: { payment_reference: text(64) },
    // The payment page asks every 3 seconds while it waits for the PIN.
    limits: [{ scope: 'ip', max: 300, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/ticket/print': {
    schema: { ticket_number: text(64) },
    limits: [{ scope: 'ip', max: 30, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
};

export function validateBody(endpoint: Endpoint, body: unknown): Validation {
  return clean(endpoint.schema, body);
}

/** The body as it goes to Travler: the checked fields plus the fixed ones. */
export function upstreamBody(endpoint: Endpoint, body: Record<string, unknown>, config: UpstreamConfig) {
  return { ...body, ...endpoint.fixed?.(config) };
}
