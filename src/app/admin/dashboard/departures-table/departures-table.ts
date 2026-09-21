import { Component, input, output } from '@angular/core';
import { Departure } from '../../../models/admin-dashboard.model';
import { WidgetError } from '../widget-error/widget-error';

@Component({
  imports: [WidgetError],
  selector: 'app-departures-table',
  styleUrl: './departures-table.css',
  templateUrl: './departures-table.html',
})
export class DeparturesTable {
  departures = input<Departure[]>([]);
  loading = input(false);
  error = input(false);
  retry = output<void>();
  readonly placeholders = [0, 1, 2, 3, 4, 5];

  fillPercent(departure: Departure): number {
    return departure.totalSeats > 0 ? Math.round((departure.seatsSold / departure.totalSeats) * 100) : 0;
  }

  isNearCapacity(departure: Departure): boolean {
    return departure.totalSeats > 0 && departure.seatsSold / departure.totalSeats > 0.95;
  }
}
