// supabase/functions/travler/index.ts
//
// Sits between BusEase and the Travler booking API, so the real API address
// and partner key stay server-side instead of shipping in the browser bundle.
//
// The app calls <supabase-url>/functions/v1/travler/<travler path>, e.g.
// .../travler/Trips/filterBuses, with the same JSON body it would send to
// Travler. Only the endpoints BusEase actually uses are forwarded; anything
// else is refused, so this can't be used as an open relay. Travler's status
// code and body are passed back untouched, so the app's own error handling
// keeps working. If Travler is unreachable or too slow, the reply uses the
// same { isSuccess: false, msg, error: { code } } shape Travler errors use.
//
// Deploy with: supabase functions deploy travler
// Needs these secrets (supabase secrets set NAME=value):
//   TRAVLER_API_URL  base URL including /globalApi, e.g. https://api.example/globalApi
//   TRAVLER_API_KEY  partner key, sent as a Bearer token (optional until Travler issues one)
//   ALLOWED_ORIGINS  same comma-separated list the login function uses

// Paths are case sensitive and deliberately inconsistent: they match the API as-is.
const ALLOWED_PATHS = new Set([
  '/common/getCity',
  '/Trips/filterBuses',
  '/trips/getTripSeatsPrice',
  '/trips/getBoardingDroppingPoints',
  '/Ticket/RoundBooking',
  '/paymentGateway/init',
  '/paymentGateway/checkMpesaPayment',
  '/ticket/print',
]);

const UPSTREAM_TIMEOUT_MS = 20_000;
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

function fail(message: string, code: string, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ isSuccess: false, msg: message, error: { code } }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
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
  if (!ALLOWED_PATHS.has(path)) {
    return fail('Unknown booking endpoint', 'NOT_FOUND', 404, headers);
  }

  const baseUrl = (Deno.env.get('TRAVLER_API_URL') ?? '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('TRAVLER_API_URL is not set');
    return fail('The booking service is not configured', 'UPSTREAM_NOT_CONFIGURED', 503, headers);
  }

  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return fail('Request body too large', 'PAYLOAD_TOO_LARGE', 413, headers);
  }
  try {
    JSON.parse(body || '{}');
  } catch {
    return fail('Request body must be valid JSON', 'INVALID_JSON', 400, headers);
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
      body: body || '{}',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    console.error(`travler ${path} failed`, error);
    return timedOut
      ? fail('The booking service took too long to answer', 'UPSTREAM_TIMEOUT', 504, headers)
      : fail('The booking service could not be reached', 'UPSTREAM_UNAVAILABLE', 502, headers);
  }

  // Passed through as text so a non-JSON error page still reaches the app
  // with its real status, rather than being turned into a different failure here.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...headers, 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
});
