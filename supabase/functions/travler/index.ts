// supabase/functions/travler/index.ts
//
// Sits between BusEase and the Travler booking API, so the real API address
// and partner key stay server-side instead of shipping in the browser bundle.
//
// The app calls <supabase-url>/functions/v1/travler/<travler path>, e.g.
// .../travler/Trips/filterBuses, with the same JSON body it would send to
// Travler. Only the endpoints BusEase actually uses are forwarded; anything
// else is refused, so this can't be used as an open relay. Each call is
// checked against the body shape and the rate limits in rules.ts before it
// goes anywhere. Travler's status code and JSON body are passed back as they
// are, so the app's own error handling keeps working. Every refusal made
// here uses the same { isSuccess: false, msg, error: { code } } shape
// Travler errors use; a rate-limited call answers 429 with
// error: { code: 'RATE_LIMITED', retryAfter } (seconds).
//
// Deploy with: supabase functions deploy travler
// Needs the rate_limits table and rate_limit_check() from
// supabase/sql/2026-10-06-travler-rate-limits.sql to already exist.
// Needs these secrets (supabase secrets set NAME=value):
//   TRAVLER_API_URL  base URL including /globalApi, e.g. https://api.example/globalApi
//   TRAVLER_API_KEY  partner key, sent as a Bearer token (optional until Travler issues one)
//   ALLOWED_ORIGINS  same comma-separated list the login function uses

import { ENDPOINTS, type Endpoint, validateBody } from './rules.ts';

const UPSTREAM_TIMEOUT_MS = 20_000;
const LIMITER_TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 64 * 1024;

// Falls back to localhost only, so a forgotten setting fails closed rather than open.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function fail(
  message: string,
  code: string,
  status: number,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ isSuccess: false, msg: message, error: { code, ...extra } }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/** The caller's address as the platform reports it. The left-most
 * x-forwarded-for entry is the fallback, since that one can be set by the
 * caller when nothing in front rewrites it. */
function callerAddress(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Buckets are keyed by a hash, so no address or phone number is stored. */
async function hashed(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Counts this call against the endpoint's limits. Returns the seconds the
 * caller has to wait (0 when within every limit), or null when the limiter
 * couldn't be reached. */
async function secondsToWait(
  path: string,
  endpoint: Endpoint,
  req: Request,
  body: Record<string, unknown>,
): Promise<number | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    return null;
  }

  const buckets: string[] = [];
  for (const limit of endpoint.limits) {
    const subject = limit.scope === 'phone' ? String(body[endpoint.phoneField ?? ''] ?? '') : callerAddress(req);
    buckets.push(`travler:${path}:${limit.scope}:${await hashed(subject)}`);
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/rate_limit_check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        p_buckets: buckets,
        p_limits: endpoint.limits.map((limit) => limit.max),
        p_windows: endpoint.limits.map((limit) => limit.windowSeconds),
      }),
      signal: AbortSignal.timeout(LIMITER_TIMEOUT_MS),
    });
    const wait = response.ok ? Number(await response.json()) : NaN;
    if (!Number.isFinite(wait)) {
      console.error(`rate_limit_check answered ${response.status}`);
      return null;
    }
    return wait;
  } catch (error) {
    console.error('rate_limit_check failed', error);
    return null;
  }
}

/** "/functions/v1/travler/Trips/filterBuses" or "/travler/Trips/filterBuses" -> "/Trips/filterBuses". */
function travlerPath(url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/travler(\/.*)$/);
  return match ? match[1].replace(/\/+$/, '') : '';
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  if (req.method !== 'POST') {
    return fail('Method not allowed', 'METHOD_NOT_ALLOWED', 405, headers);
  }

  const path = travlerPath(req.url);
  const endpoint = Object.hasOwn(ENDPOINTS, path) ? ENDPOINTS[path] : undefined;
  if (!endpoint) {
    return fail('Unknown booking endpoint', 'NOT_FOUND', 404, headers);
  }

  const baseUrl = (Deno.env.get('TRAVLER_API_URL') ?? '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('TRAVLER_API_URL is not set');
    return fail('The booking service is not configured', 'UPSTREAM_NOT_CONFIGURED', 503, headers);
  }

  // Refused on the declared size first, so an oversized upload isn't read in.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail('Request body too large', 'PAYLOAD_TOO_LARGE', 413, headers);
  }
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return fail('Request body too large', 'PAYLOAD_TOO_LARGE', 413, headers);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || '{}');
  } catch {
    return fail('Request body must be valid JSON', 'INVALID_JSON', 400, headers);
  }
  const checked = validateBody(endpoint, parsed);
  if (!checked.ok) {
    return fail(checked.message, 'VALIDATION_ERROR', 400, headers);
  }

  const wait = await secondsToWait(path, endpoint, req, checked.body);
  if (wait === null && endpoint.refuseWithoutLimiter) {
    return fail('The booking service is busy. Please try again shortly.', 'LIMITER_UNAVAILABLE', 503, headers);
  }
  if (wait) {
    return fail('Too many requests. Please wait and try again.', 'RATE_LIMITED', 429, { ...headers, 'Retry-After': String(wait) }, {
      retryAfter: wait,
    });
  }

  const upstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = Deno.env.get('TRAVLER_API_KEY');
  if (apiKey) {
    upstreamHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(checked.body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    console.error(`travler ${path} failed`, error);
    return timedOut
      ? fail('The booking service took too long to answer', 'UPSTREAM_TIMEOUT', 504, headers)
      : fail('The booking service could not be reached', 'UPSTREAM_UNAVAILABLE', 502, headers);
  }

  // Travler answers in JSON, errors included, and those go back with their
  // real status. Anything else (a gateway's HTML error page, say) is not
  // something to hand to a browser, so it becomes a plain failure here.
  const upstreamBody = await upstream.text();
  try {
    JSON.parse(upstreamBody);
  } catch {
    console.error(`travler ${path} answered ${upstream.status} with a non-JSON body`);
    return fail('The booking service gave an unexpected answer', 'UPSTREAM_BAD_RESPONSE', 502, headers);
  }
  return new Response(upstreamBody, {
    status: upstream.status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
});
