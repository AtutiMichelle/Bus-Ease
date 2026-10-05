import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { REQUEST_TIMEOUT_MS, requestTimeoutInterceptor } from './request-timeout.interceptor';

const URL = 'http://localhost:4010/globalApi/common/getCity';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([requestTimeoutInterceptor])), provideHttpClientTesting()],
  });
  return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
}

describe('requestTimeoutInterceptor', () => {
  afterEach(() => vi.useRealTimers());

  it('lets an answered call through', () => {
    const { http, backend } = setup();
    let body: unknown;
    http.post(URL, {}).subscribe((response) => (body = response));
    backend.expectOne(URL).flush({ isSuccess: true });
    expect(body).toEqual({ isSuccess: true });
  });

  it('fails a call that never answers, like a dropped connection', () => {
    vi.useFakeTimers();
    const { http, backend } = setup();
    let failure: unknown;
    http.post(URL, {}).subscribe({ error: (error) => (failure = error) });
    backend.expectOne(URL);

    vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect((failure as HttpErrorResponse).status).toBe(0);
  });

  it('passes a real server error through unchanged', () => {
    const { http, backend } = setup();
    let failure: unknown;
    http.post(URL, {}).subscribe({ error: (error) => (failure = error) });
    backend.expectOne(URL).flush({ isSuccess: false }, { status: 500, statusText: 'Server Error' });
    expect((failure as HttpErrorResponse).status).toBe(500);
  });
});
