import { Component, inject, signal } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { AuthModal } from './components/auth-modal/auth-modal';
import { AuthModalService } from './services/auth-modal.service';
import { recoverFromStaleChunkLoad } from './utils/stale-chunk-recovery';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, AuthModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  authModal = inject(AuthModalService);
  private router = inject(Router);

  /** The admin dashboard has its own full-page sidebar/top bar layout, so the
   * customer-facing header and footer are hidden for it. */
  isAdminRoute = signal(this.router.url.startsWith('/admin'));

  constructor() {
    // Keep anchor scrolls (e.g. #about) from landing under the fixed header.
    inject(ViewportScroller).setOffset([0, 80]);
    recoverFromStaleChunkLoad();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.isAdminRoute.set(event.urlAfterRedirects.startsWith('/admin')));
  }
}
