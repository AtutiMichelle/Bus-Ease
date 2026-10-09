import { Component, computed, inject, signal } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { AuthModal } from './components/auth-modal/auth-modal';
import { AuthModalService } from './services/auth-modal.service';
import { recoverFromStaleChunkLoad } from './utils/stale-chunk-recovery';
import { VoiceStateService } from './voice/voice-state.service';
import { VoiceDock } from './voice/voice-dock/voice-dock';
import { VoiceScrim } from './voice/voice-scrim/voice-scrim';
import { VoiceDemo, voiceDemoEnabled } from './voice/voice-demo/voice-demo';

/** Booking pages that get the floating voice mic. Home has its own mic in
 * the search card instead. */
const VOICE_DOCK_PATHS = ['/results', '/confirmation'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, AuthModal, VoiceDock, VoiceScrim, VoiceDemo],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '[class.has-voice-dock]': 'voiceDockVisible()',
  },
})
export class App {
  authModal = inject(AuthModalService);
  private router = inject(Router);

  /** The admin dashboard has its own full-page sidebar/top bar layout, so the
   * customer-facing header and footer are hidden for it. */
  isAdminRoute = signal(this.router.url.startsWith('/admin'));

  private voice = inject(VoiceStateService);
  private url = signal(this.router.url);
  readonly voiceDemo = voiceDemoEnabled();

  /** Home dims the whole page behind its voice panel. The header sits above
   * the page, so it is dimmed from here to match. Other pages are never
   * dimmed: people need to see the buses, seats and form to answer. */
  voiceDimsHeader = computed(() => this.voice.open() && this.url().split(/[?#]/)[0] === '/');

  /** The seat panel covers the page and carries its own mic, so the page's
   * floating one steps aside while a bus is open (busId in the URL). */
  voiceDockVisible = computed(() => {
    const [path, query = ''] = this.url().split('?');
    return this.voice.supported() && VOICE_DOCK_PATHS.includes(path) && !new URLSearchParams(query).has('busId');
  });

  constructor() {
    // Keep anchor scrolls (e.g. #about) from landing under the fixed header.
    inject(ViewportScroller).setOffset([0, 80]);
    recoverFromStaleChunkLoad();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.isAdminRoute.set(event.urlAfterRedirects.startsWith('/admin'));
        // Each page is its own step in the conversation.
        const path = (url: string) => url.split(/[?#]/)[0];
        if (path(event.urlAfterRedirects) !== path(this.url())) {
          this.voice.clearMessages();
        }
        this.url.set(event.urlAfterRedirects);
      });
  }
}
