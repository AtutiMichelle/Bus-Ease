// supabase/functions/travler/rules.ts
//
// What the travler function accepts and how often, one entry per endpoint.
// Kept apart from index.ts and free of Deno APIs so it can be checked on its
// own.
//
// Request bodies are rebuilt from the fields listed here: anything else the
// caller sends is dropped, and a missing or wrong-shaped field is refused
// before Travler is called. The shapes match what BusEase sends (see
// src/app/travler/travler.types.ts). A new field has to be added here before
// it reaches Travler.

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

function nullable(field: Field): Field {
  return (value) => (value === null || value === undefined ? null : field(value));
}

function integer(min: number, max: number): Field {
  return (value) => (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : INVALID);
}

const amount: Field = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000_000 ? value : INVALID;

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

export interface Endpoint {
  schema: Schema;
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

const paymentLeg = object({ sponsorTrip: oneOf(true, false), discountId: nullable(text(64)) });

// Paths are case sensitive and deliberately inconsistent: they match the API as-is.
export const ENDPOINTS: Record<string, Endpoint> = {
  '/common/getCity': {
    schema: { city_id: nullable(id), city_type: oneOf('source', 'destination') },
    limits: [{ scope: 'ip', max: 120, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/Trips/filterBuses': {
    schema: { source_city_id: id, destination_city_id: id, travel_date: date, passenger_count: integer(1, 10) },
    limits: [{ scope: 'ip', max: 60, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/trips/getTripSeatsPrice': {
    schema: { bus_id: id, route_id: id, travel_date: date },
    limits: [{ scope: 'ip', max: 120, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/trips/getBoardingDroppingPoints': {
    schema: { bus_id: id, route_id: id },
    limits: [{ scope: 'ip', max: 120, windowSeconds: MINUTE }],
    refuseWithoutLimiter: false,
  },
  '/Ticket/RoundBooking': {
    schema: {
      bus_id: id,
      travel_date: date,
      boarding_point_id: id,
      dropping_point_id: id,
      passengers: list(
        object({
          name: text(100),
          id_number: text(20, /^[A-Za-z0-9]{5,20}$/),
          seat_number: text(8),
          seat_type: text(20),
        }),
        1,
        6,
      ),
      contact_email: email,
      contact_phone: phone,
      total_amount: amount,
    },
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
      queryoption: oneOf(1),
      queryvalue: phone,
      requestType: oneOf('STK_PUSH'),
      // Wallet payment isn't offered yet, so only `false` goes through.
      isWalletApply: oneOf(false),
      additionalInfo: object({ onward: paymentLeg, return: paymentLeg }),
      total_amount: amount,
      paymentMethod: oneOf('mpesa'),
      sourcetype: oneOf('web'),
    },
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
