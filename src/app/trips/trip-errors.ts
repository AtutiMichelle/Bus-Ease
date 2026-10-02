/** Thrown by any trip provider for a failed call. `message` is always safe
 * to show to a customer; `apiMessage` and `code` keep the raw detail for
 * logs and for branching (e.g. code === 'PAYMENT_REJECTED'). */
export class TripApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
    readonly apiMessage: string | null,
  ) {
    super(message);
    this.name = 'TripApiError';
  }
}

/** The message to show for any error a page catches from a trip provider. */
export function tripErrorMessage(error: unknown, fallback: string): string {
  return error instanceof TripApiError ? error.message : fallback;
}
