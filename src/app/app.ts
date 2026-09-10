import { Component, inject } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { RouterOutlet } from '@angular/router';
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

  constructor() {
    // Keep anchor scrolls (e.g. #about) from landing under the fixed header.
    inject(ViewportScroller).setOffset([0, 80]);
    recoverFromStaleChunkLoad();
  }
}
