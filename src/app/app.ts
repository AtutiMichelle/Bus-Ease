import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { AuthModal } from './components/auth-modal/auth-modal';
import { AuthModalService } from './services/auth-modal.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, AuthModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  authModal = inject(AuthModalService);
}
