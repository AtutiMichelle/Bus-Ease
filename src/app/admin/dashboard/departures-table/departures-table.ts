import { Component, input } from '@angular/core';
import { Departure } from '../../../models/admin-dashboard.model';

@Component({
  selector: 'app-departures-table',
  styleUrl: './departures-table.css',
  templateUrl: './departures-table.html',
})
export class DeparturesTable {
  departures = input<Departure[]>([]);

  fillPercent(departure: Departure): number {
    return Math.round((departure.seatsSold / departure.totalSeats) * 100);
  }

  isNearCapacity(departure: Departure): boolean {
    return departure.seatsSold / departure.totalSeats > 0.95;
  }
}
