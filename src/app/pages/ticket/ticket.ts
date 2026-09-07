import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusService } from '../../services/bus.service';
import { Bus } from '../../models/bus.model';

type Phase = 'loading' | 'ready' | 'error';

@Component({
  imports: [RouterLink],
  selector: 'app-ticket',
  styleUrl: './ticket.css',
  templateUrl: './ticket.html',
})
export class Ticket {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 4;

  bus = signal<Bus | undefined>(undefined);
  phase = signal<Phase>('loading');
  errorMessage = signal('');
  reference = signal('');
  seatNumbers = signal<string[]>([]);

  seatList = computed(() => this.seatNumbers().join(', '));
  totalPrice = computed(() => (this.bus()?.price ?? 0) * this.seatNumbers().length);

  private busId: string;

  constructor(
    private route: ActivatedRoute,
    private busService: BusService,
  ) {
    const params = this.route.snapshot.queryParamMap;
    this.busId = params.get('busId') ?? '';
    this.reference.set(params.get('reference') ?? '');
    const seatsParam = params.get('seats') ?? '';
    this.seatNumbers.set(seatsParam ? seatsParam.split(',') : []);
    this.load();
  }

  private async load(): Promise<void> {
    if (!this.busId || !this.reference() || this.seatNumbers().length === 0) {
      this.errorMessage.set('Missing booking details.');
      this.phase.set('error');
      return;
    }
    try {
      const bus = await this.busService.getById(this.busId);
      if (!bus) {
        this.errorMessage.set("We couldn't find that bus.");
        this.phase.set('error');
        return;
      }
      this.bus.set(bus);
      this.phase.set('ready');
    } catch {
      this.errorMessage.set('Could not load your ticket. Please try again.');
      this.phase.set('error');
    }
  }

  print(): void {
    window.print();
  }
}
