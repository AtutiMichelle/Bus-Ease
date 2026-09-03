import { Component, computed, effect, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { todayDateString } from '../../utils/date';

@Component({
  imports: [FormsModule],
  selector: 'app-search-bar',
  styleUrl: './search-bar.css',
  templateUrl: './search-bar.html',
  host: {
    '[class.compact]': "variant() === 'compact'",
  },
})
export class SearchBar {
  variant = input<'hero' | 'compact'>('hero');
  origin = input('', { alias: 'origin' });
  destination = input('', { alias: 'destination' });
  date = input('', { alias: 'date' });

  originValue = signal('');
  destinationValue = signal('');
  dateValue = signal('');

  minDate = todayDateString();

  kenyanTowns: string[] = [
    'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Malindi', 'Kampala', 'Kericho',
    'Kitale', 'Meru', 'Nyeri', 'Naivasha', 'Kakamega', 'Bungoma', 'Machakos', 'Thika',
    'Kisii', 'Narok', 'Voi', 'Lamu', 'Garissa', 'Isiolo',
  ];

  showOriginSuggestions = signal(false);
  showDestinationSuggestions = signal(false);

  originSuggestions = computed(() => this.matchTowns(this.originValue()));
  destinationSuggestions = computed(() => this.matchTowns(this.destinationValue()));

  constructor(private router: Router) {
    effect(() => {
      this.originValue.set(this.origin());
      this.destinationValue.set(this.destination());
      this.dateValue.set(this.date() || todayDateString());
    });
  }

  private matchTowns(query: string): string[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return this.kenyanTowns.filter((town) => town.toLowerCase().startsWith(q)).slice(0, 6);
  }

  selectOrigin(town: string): void {
    this.originValue.set(town);
    this.showOriginSuggestions.set(false);
  }

  selectDestination(town: string): void {
    this.destinationValue.set(town);
    this.showDestinationSuggestions.set(false);
  }

  get sameOriginDestination(): boolean {
    return (
      this.originValue().trim().length > 0 &&
      this.originValue().trim().toLowerCase() === this.destinationValue().trim().toLowerCase()
    );
  }

  get canSearch(): boolean {
    return (
      this.originValue().trim().length > 0 &&
      this.destinationValue().trim().length > 0 &&
      !this.sameOriginDestination
    );
  }

  search(): void {
    if (!this.canSearch) {
      return;
    }
    this.router.navigate(['/results'], {
      queryParams: {
        origin: this.originValue().trim(),
        destination: this.destinationValue().trim(),
        journeyDate: this.dateValue().trim() || todayDateString(),
      },
    });
  }
}
