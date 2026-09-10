import { inject } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';

const RELOAD_FLAG = 'busease:reloaded-for-stale-chunk';

const STALE_CHUNK_PATTERN = /dynamically imported module|loading chunk|chunkloaderror|importing a module script failed/i;

/**
 * Every route's code lives in its own lazy-loaded JS file, named with a
 * content hash that changes on each deploy. A tab left open across a deploy
 * still holds the old hash, so navigating to a route it hasn't loaded yet
 * tries to fetch a chunk that no longer exists — that fetch fails silently
 * and the router leaves the page blank instead of showing an error.
 *
 * Detect that specific failure and reload once to pick up the current
 * bundle, instead of leaving the user on a blank screen. The session flag
 * stops a genuinely broken chunk from reloading forever; it's cleared again
 * once a navigation actually succeeds, so a later deploy can still recover.
 */
export function recoverFromStaleChunkLoad(): void {
  const router = inject(Router);

  router.events.subscribe((event) => {
    if (event instanceof NavigationEnd) {
      sessionStorage.removeItem(RELOAD_FLAG);
      return;
    }

    if (!(event instanceof NavigationError)) {
      return;
    }

    const message = String(event.error?.message ?? event.error ?? '');
    if (!STALE_CHUNK_PATTERN.test(message)) {
      return;
    }
    if (sessionStorage.getItem(RELOAD_FLAG)) {
      return;
    }

    sessionStorage.setItem(RELOAD_FLAG, '1');
    // A full navigation (not just reload()) — the router hadn't updated the
    // address bar to `event.url` yet since the navigation never resolved, so
    // a plain reload would just re-land wherever the user already was.
    window.location.href = event.url;
  });
}
