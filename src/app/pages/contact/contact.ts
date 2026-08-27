import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [FormsModule],
  selector: 'app-contact',
  styleUrl: './contact.css',
  templateUrl: './contact.html',
})
export class Contact {
  name = signal('');
  email = signal('');
  message = signal('');
  submitted = signal(false);

  get canSubmit(): boolean {
    return this.name().trim().length > 0 && this.email().trim().length > 0 && this.message().trim().length > 0;
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    this.submitted.set(true);
  }
}
