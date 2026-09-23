// supabase/functions/login/index.ts
//
// Stands in for supabase.auth.signInWithPassword() so login can be locked
// out server-side after repeated failures. Supabase's own Auth Hook for
// this (Authentication > Hooks > Password Verification Attempt) needs a
// Team/Enterprise plan; this function gets the same result on Free by
// sitting in front of the real sign-in call instead of hooking into it.
//
// Flow: check login_lockouts for this email and call Supabase Auth for
// real at the same time (they're independent) -> if locked, reject
// regardless of what the credential check came back with -> otherwise
// record the outcome in the background (reset on success, count up and
// maybe lock on failure) and hand the session back to the client, which
// sets it locally via supabase.auth.setSession().
//
// Responds 200 with either { session } or { error: { message } } in the
// body for the ordinary cases. The one exception is a locked-out email:
// that answers 429 with { error: 'locked', retryAfter }, where retryAfter
// is the whole seconds left on the lock, so the client can disable the
// form and count down instead of just printing a sentence.
//
// Deploy with: supabase functions deploy login
// Needs the login_lockouts table from
// supabase/sql/2026-09-22-login-lockout.sql to already exist.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Comma-separated list of origins allowed to call this function, e.g.
// "http://localhost:4200,https://busease.example.com". Set with:
//   supabase secrets set ALLOWED_ORIGINS=https://your-real-domain
// Falls back to localhost only, so a forgotten setting fails closed rather
// than open.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

function json(body: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Recording the outcome in login_lockouts doesn't need to finish before the
// user sees their result -- it only has to be durable by the *next*
// request. EdgeRuntime.waitUntil() lets the function return its response
// immediately while this keeps running in the background (falls back to a
// plain fire-and-forget outside the Supabase edge runtime, e.g. `deno
// task` locally, where that global doesn't exist).
function background(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) {
    runtime.waitUntil(promise);
  } else {
    promise.catch(() => {});
  }
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  if (req.method !== 'POST') {
    return json({ error: { message: 'Method not allowed' } }, headers, 405);
  }

  let email = '';
  let password = '';
  try {
    const body = await req.json();
    email = String(body.email ?? '').trim().toLowerCase();
    password = String(body.password ?? '');
  } catch {
    return json({ error: { message: 'Invalid request body' } }, headers);
  }

  if (!email || !password) {
    return json({ error: { message: 'Email and password are required' } }, headers);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // service-role client: only ever touches login_lockouts, never anything
  // a user could see or influence beyond their own login attempts.
  const admin = createClient(supabaseUrl, serviceRoleKey);
  // anon-key client: this is the actual credential check, same call the
  // client used to make directly. Using the anon key (not the service
  // role) keeps this function from ever being able to sign in as anyone
  // without their real password.
  const authClient = createClient(supabaseUrl, anonKey);

  // The lockout check and the real credential check don't depend on each
  // other's result, only on the same (email, password) input, so they run
  // concurrently rather than one after another -- this is the difference
  // between the request taking as long as the slower of the two calls
  // instead of the sum of both. The cost: a locked-out attacker's guess
  // still gets evaluated by Supabase Auth instead of being skipped, but the
  // response is identical either way ("too many attempts"), so nothing
  // about whether the guess was right ever reaches the caller.
  const [{ data: lockRow, error: selectError }, { data, error }] = await Promise.all([
    admin.from('login_lockouts').select('failed_count, locked_until').eq('email', email).maybeSingle(),
    authClient.auth.signInWithPassword({ email, password }),
  ]);

  if (selectError) {
    // Logged, not thrown: losing the lockout for one request during an
    // infra hiccup is better than locking every user out of signing in at
    // all. But this should never happen in normal operation, so it needs
    // to be loud in the function logs rather than silently swallowed.
    console.error('login_lockouts select failed', selectError);
  }

  // Seconds left on an active lock, rounded up so the client never counts
  // down to zero a moment before the server would actually let them back in.
  const lockedUntil = lockRow?.locked_until ? new Date(lockRow.locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return json(
      { error: 'locked', retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) },
      headers,
      429,
    );
  }

  if (error || !data.session) {
    const nextCount = (lockRow?.failed_count ?? 0) + 1;
    const locked = nextCount >= MAX_ATTEMPTS;
    const newLockedUntil = locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
    background(
      admin
        .from('login_lockouts')
        .upsert({
          email,
          failed_count: nextCount,
          locked_until: newLockedUntil ? newLockedUntil.toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .then(({ error: upsertError }) => {
          if (upsertError) {
            console.error('login_lockouts upsert failed', upsertError);
          }
        }),
    );

    // The attempt that trips the lock answers the same way a later attempt
    // would, so the countdown starts right away instead of on the next try.
    if (newLockedUntil) {
      return json(
        { error: 'locked', retryAfter: Math.ceil((newLockedUntil.getTime() - Date.now()) / 1000) },
        headers,
        429,
      );
    }
    return json({ error: { message: error?.message ?? 'Invalid login credentials' } }, headers);
  }

  background(
    admin
      .from('login_lockouts')
      .delete()
      .eq('email', email)
      .then(({ error: deleteError }) => {
        if (deleteError) {
          console.error('login_lockouts delete failed', deleteError);
        }
      }),
  );

  return json({ session: data.session }, headers);
});
