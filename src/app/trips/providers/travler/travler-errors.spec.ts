import { HttpErrorResponse } from '@angular/common/http';
import { toTravlerError } from './travler-errors';

function rateLimited(retryAfter?: number): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 429,
    error: { isSuccess: false, msg: 'Too many requests. Please wait and try again.', error: { code: 'RATE_LIMITED', retryAfter } },
  });
}

describe('toTravlerError', () => {
  it('tells a rate-limited customer how many minutes to wait', () => {
    const error = toTravlerError(rateLimited(431), 'fallback');

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(error.message).toBe('Too many attempts. Please try again in 8 minutes.');
  });

  it('asks for a minute when the wait is under a minute', () => {
    expect(toTravlerError(rateLimited(12), 'fallback').message).toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('still explains a rate limit that comes without a wait time', () => {
    expect(toTravlerError(rateLimited(), 'fallback').message).toBe('Too many attempts. Please wait a few minutes and try again.');
  });

  it('uses the fallback for an unknown error code', () => {
    const error = toTravlerError(new HttpErrorResponse({ status: 400, error: { isSuccess: false, error: { code: 'SOMETHING_NEW' } } }), 'fallback');

    expect(error.message).toBe('fallback');
  });
});
