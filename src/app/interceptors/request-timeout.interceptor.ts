import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TimeoutError, catchError, throwError, timeout } from 'rxjs';

/** Longer than the 20 seconds the `travler` edge function gives the booking
 * API, so the server's own "took too long" answer arrives first when it can. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Gives up on a call that never answers, so a page can't sit on a spinner
 * forever. The failure is reported the same way a dropped connection is
 * (status 0), which the app already knows how to explain to the customer. */
export const requestTimeoutInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    timeout(REQUEST_TIMEOUT_MS),
    catchError((error) =>
      throwError(() =>
        error instanceof TimeoutError
          ? new HttpErrorResponse({ status: 0, statusText: 'Timeout', url: req.url, error })
          : error,
      ),
    ),
  );
