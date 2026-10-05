import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environment';
import { AuthService } from '../services/auth.service';
import { supabaseAuthInterceptor } from './supabase-auth.interceptor';

const FUNCTION_URL = `${environment.supabase.url}/functions/v1/travler/common/getCity`;

function setup(getSession: () => Promise<{ access_token: string } | null>) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([supabaseAuthInterceptor])),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { getSession } },
    ],
  });
  return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
}

/** The session lookup is async, so the request only reaches the backend a tick later. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('supabaseAuthInterceptor', () => {
  it("sends the signed-in user's token to our edge functions", async () => {
    const { http, backend } = setup(async () => ({ access_token: 'user-token' }));
    http.post(FUNCTION_URL, {}).subscribe();
    await settle();

    const { request } = backend.expectOne(FUNCTION_URL);
    expect(request.headers.get('apikey')).toBe(environment.supabase.key);
    expect(request.headers.get('Authorization')).toBe('Bearer user-token');
  });

  it('sends the project key for a guest', async () => {
    const { http, backend } = setup(async () => null);
    http.post(FUNCTION_URL, {}).subscribe();
    await settle();

    const { request } = backend.expectOne(FUNCTION_URL);
    expect(request.headers.get('Authorization')).toBe(`Bearer ${environment.supabase.key}`);
  });

  it('still sends the call when the session lookup fails', async () => {
    const { http, backend } = setup(async () => {
      throw new Error('boom');
    });
    http.post(FUNCTION_URL, {}).subscribe();
    await settle();

    const { request } = backend.expectOne(FUNCTION_URL);
    expect(request.headers.get('Authorization')).toBe(`Bearer ${environment.supabase.key}`);
  });

  it('adds nothing to calls for other servers', () => {
    const { http, backend } = setup(async () => ({ access_token: 'user-token' }));
    http.post('http://localhost:4010/globalApi/common/getCity', {}).subscribe();

    const { request } = backend.expectOne('http://localhost:4010/globalApi/common/getCity');
    expect(request.headers.has('apikey')).toBe(false);
    expect(request.headers.has('Authorization')).toBe(false);
  });
});
