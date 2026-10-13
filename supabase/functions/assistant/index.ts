// supabase/functions/assistant/index.ts
//
// Sits between the BusEase voice assistant and the AI model that writes its
// replies, so the model key stays server-side instead of shipping in the
// browser bundle.
//
// The app calls <supabase-url>/functions/v1/assistant with
// { today: 'yyyy-mm-dd', messages: [...] }, the conversation so far. This
// function adds the standing instructions and the tool list from rules.ts,
// asks the model, and answers { isSuccess: true, message } where message is
// either the model's words ({ content }) or the tools it wants the app to
// run ({ content, tool_calls }). The app runs the tools itself against the
// live trip source and calls again with the results.
//
// Every refusal uses the same { isSuccess: false, msg, error: { code } }
// shape the travler function uses; a rate-limited call answers 429 with
// error: { code: 'RATE_LIMITED', retryAfter } (seconds). The app falls back
// to its built-in replies whenever this function fails.
//
// Deploy with: supabase functions deploy assistant
// Needs the rate_limits table and rate_limit_check() from
// supabase/sql/2026-10-06-travler-rate-limits.sql to already exist.
// Needs these secrets (supabase secrets set NAME=value):
//   GROQ_API_KEY                key for the model provider
//   ALLOWED_ORIGINS             same comma-separated list the other functions use
// Optional, to change model or provider without a code change (any provider
// with an OpenAI-style chat completions endpoint works):
//   ASSISTANT_MODEL             defaults to openai/gpt-oss-120b
//   ASSISTANT_API_URL           defaults to Groq's chat completions endpoint
//   ASSISTANT_REASONING_EFFORT  defaults to low; set to "none" to leave it out

import { LIMITS, TOOLS, cleanReply, systemPrompt, validateBody } from './rules.ts';

const UPSTREAM_TIMEOUT_MS = 20_000;
const LIMITER_TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 32 * 1024;
/** Room for a short spoken reply plus the model's own thinking. */
const MAX_REPLY_TOKENS = 500;

const DEFAULT_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

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

/** Buckets are keyed by a hash, so no address is stored. */
async function hashed(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Counts this call against the limits. Returns the seconds the caller has
 * to wait (0 when within every limit), or null when the limiter couldn't be
 * reached. */
async function secondsToWait(req: Request): Promise<number | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    return null;
  }

  const caller = await hashed(callerAddress(req));
  const buckets = LIMITS.map((limit) =>
    limit.scope === 'caller' ? `assistant:caller:${limit.windowSeconds}:${caller}` : `assistant:everyone:${limit.windowSeconds}`,
  );

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
        p_limits: LIMITS.map((limit) => limit.max),
        p_windows: LIMITS.map((limit) => limit.windowSeconds),
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

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  if (req.method !== 'POST') {
    return fail('Method not allowed', 'METHOD_NOT_ALLOWED', 405, headers);
  }

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set');
    return fail('The assistant is not configured', 'UPSTREAM_NOT_CONFIGURED', 503, headers);
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
  const checked = validateBody(parsed);
  if (!checked.ok) {
    return fail(checked.message, 'VALIDATION_ERROR', 400, headers);
  }

  // Every call spends the model allowance, so nothing goes through uncounted.
  const wait = await secondsToWait(req);
  if (wait === null) {
    return fail('The assistant is busy. Please try again shortly.', 'LIMITER_UNAVAILABLE', 503, headers);
  }
  if (wait) {
    return fail('Too many requests. Please wait and try again.', 'RATE_LIMITED', 429, { ...headers, 'Retry-After': String(wait) }, {
      retryAfter: wait,
    });
  }

  const reasoningEffort = Deno.env.get('ASSISTANT_REASONING_EFFORT') ?? 'low';
  const request: Record<string, unknown> = {
    model: Deno.env.get('ASSISTANT_MODEL') ?? DEFAULT_MODEL,
    messages: [{ role: 'system', content: systemPrompt(checked.today) }, ...checked.messages],
    tools: TOOLS,
    tool_choice: 'auto',
    temperature: 0.3,
    max_completion_tokens: MAX_REPLY_TOKENS,
  };
  if (reasoningEffort !== 'none') {
    request['reasoning_effort'] = reasoningEffort;
  }

  let upstream: Response;
  try {
    upstream = await fetch(Deno.env.get('ASSISTANT_API_URL') ?? DEFAULT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    console.error('assistant model call failed', error);
    return timedOut
      ? fail('The assistant took too long to answer', 'UPSTREAM_TIMEOUT', 504, headers)
      : fail('The assistant could not be reached', 'UPSTREAM_UNAVAILABLE', 502, headers);
  }

  if (upstream.status === 429) {
    // The provider's own allowance has run out. Its answer isn't passed on,
    // only how long to wait.
    const retryAfter = Math.max(1, Math.ceil(Number(upstream.headers.get('retry-after')) || 60));
    console.error('assistant model is rate limited');
    return fail('The assistant is busy. Please try again shortly.', 'RATE_LIMITED', 429, { ...headers, 'Retry-After': String(retryAfter) }, {
      retryAfter,
    });
  }
  if (!upstream.ok) {
    // The provider's error text stays in the logs; it can name the model or
    // account and is of no use to a browser.
    console.error(`assistant model answered ${upstream.status}: ${(await upstream.text()).slice(0, 500)}`);
    return fail('The assistant gave an unexpected answer', 'UPSTREAM_BAD_RESPONSE', 502, headers);
  }

  let message: ReturnType<typeof cleanReply> = null;
  try {
    const answer = await upstream.json();
    message = cleanReply(answer?.choices?.[0]?.message);
  } catch {
    // Handled below with every other unusable answer.
  }
  if (!message) {
    console.error('assistant model answered without words or a usable tool call');
    return fail('The assistant gave an unexpected answer', 'UPSTREAM_BAD_RESPONSE', 502, headers);
  }

  return new Response(JSON.stringify({ isSuccess: true, message }), {
    status: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
});
