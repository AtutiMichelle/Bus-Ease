const STORAGE_KEY = 'busease_guest_token';

/** Identifies an unauthenticated booker to the seat-hold functions, so
 * their own page reload or retry can refresh their hold instead of
 * failing against it. Persisted per-tab only (sessionStorage) — a fresh
 * hold each new visit is fine, this just needs to survive this one. */
export function getGuestToken(): string {
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const token = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, token);
  return token;
}
