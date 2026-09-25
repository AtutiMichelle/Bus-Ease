import { HttpErrorResponse } from '@angular/common/http';
import { TravlerErrorBody } from './travler.types';

/** Thrown by TravlerApiService for any failed call. `message` is always safe
 * to show to a customer; `apiMessage` and `code` keep the raw detail for
 * logs and for branching (e.g. code === 'PAYMENT_REJECTED'). */
export class TravlerApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
    readonly apiMessage: string | null,
  ) {
    super(message);
    this.name = 'TravlerApiError';
  }
}

/** Friendly text per known API error code. */
const MESSAGES_BY_CODE: Record<string, string> = {
  PAYMENT_REJECTED: 'The M-Pesa payment was declined or cancelled. Please try again.',
  PAYMENT_TIMEOUT: "We didn't get a response from M-Pesa in time. Please try again.",
  INSUFFICIENT_FUNDS: "The M-Pesa payment didn't go through because of insufficient funds.",
  SEAT_UNAVAILABLE: 'One or more of your seats were just taken. Please pick different seats.',
  SEATS_UNAVAILABLE: 'One or more of your seats were just taken. Please pick different seats.',
  BOOKING_EXPIRED: 'Your booking hold has expired. Please select your seats again.',
  NOT_FOUND: "We couldn't find what you were looking for. Please try again.",
  VALIDATION_ERROR: 'Some booking details look wrong. Please check them and try again.',
};

function friendlyMessage(code: string | null, status: number | null, fallback: string): string {
  if (code && MESSAGES_BY_CODE[code]) {
    return MESSAGES_BY_CODE[code];
  }
  if (status === 0) {
    return "We couldn't reach the booking service. Check your connection and try again.";
  }
  if (status !== null && status >= 500) {
    return 'The booking service is having trouble right now. Please try again shortly.';
  }
  return fallback;
}

interface ErrorLikeBody {
  isSuccess?: boolean;
  msg?: string;
  error?: TravlerErrorBody;
}

function readBody(body: unknown): ErrorLikeBody {
  return body && typeof body === 'object' ? (body as ErrorLikeBody) : {};
}

/** For a 2xx response whose body says `isSuccess: false`. */
export function errorFromBody(body: unknown, fallback: string): TravlerApiError {
  const parsed = readBody(body);
  const code = parsed.error?.code ?? null;
  return new TravlerApiError(friendlyMessage(code, null, fallback), code, null, parsed.msg ?? null);
}

/** For anything thrown while making the call: non-2xx, network, or already a TravlerApiError. */
export function toTravlerError(error: unknown, fallback: string): TravlerApiError {
  if (error instanceof TravlerApiError) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    const parsed = readBody(error.error);
    const code = parsed.error?.code ?? null;
    return new TravlerApiError(friendlyMessage(code, error.status, fallback), code, error.status, parsed.msg ?? null);
  }
  return new TravlerApiError(fallback, null, null, error instanceof Error ? error.message : null);
}

/** The message to show for any error a page catches from the API layer. */
export function travlerErrorMessage(error: unknown, fallback: string): string {
  return error instanceof TravlerApiError ? error.message : fallback;
}
