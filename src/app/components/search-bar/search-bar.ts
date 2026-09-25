import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { todayDateString } from '../../utils/date';
import { TravlerApiService } from '../../travler/travler-api.service';
import { travlerErrorMessage } from '../../travler/travler-errors';
import { City } from '../../models/trip.model';

/** How many city suggestions to show at once. */
const MAX_SUGGESTIONS = 8;

@Component({
  imports: [FormsModule],
  selector: 'app-search-bar',
  styleUrl: './search-bar.css',
  templateUrl: './search-bar.html',
  host: {
    '[class.compact]': "variant() === 'compact'",
    '[class.ticket]': "variant() === 'ticket'",
  },
})
export class SearchBar {
  variant = input<'hero' | 'compact' | 'ticket'>('hero');
  origin = input('', { alias: 'origin' });
  destination = input('', { alias: 'destination' });
  date = input('', { alias: 'date' });
  originId = input('', { alias: 'originId' });
  destinationId = input('', { alias: 'destinationId' });

  private travler = inject(TravlerApiService);

  /** What the user sees and types: city names. */
  originValue = signal('');
  destinationValue = signal('');
  /** What the search actually uses: the booking API's city ids. */
  originCityId = signal('');
  destinationCityId = signal('');

  sourceCities = signal<City[]>([]);
  destinationCities = signal<City[]>([]);
  loadingDestinations = signal(false);
  citiesError = signal('');
  dateValue = signal('');
  dateDisplayValue = signal('');
  dateError = signal<string | null>(null);

  minDate = todayDateString();

  showCalendar = signal(false);
  calendarViewYear = signal(new Date().getFullYear());
  calendarViewMonth = signal(new Date().getMonth());

  readonly weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  calendarLabel = computed(() =>
    new Date(this.calendarViewYear(), this.calendarViewMonth(), 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
  );

  isPrevMonthDisabled = computed(() => {
    const [minYear, minMonth] = this.minDate.split('-').map(Number);
    return this.calendarViewYear() === minYear && this.calendarViewMonth() === minMonth - 1;
  });

  calendarCells = computed(() => {
    const year = this.calendarViewYear();
    const month = this.calendarViewMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selectedIso = this.dateValue();
    const todayIso = todayDateString();

    const cells: ({ day: number; iso: string; disabled: boolean; selected: boolean; isToday: boolean } | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        iso,
        disabled: iso < this.minDate,
        selected: iso === selectedIso,
        isToday: iso === todayIso,
      });
    }
    return cells;
  });

  showOriginSuggestions = signal(false);
  showDestinationSuggestions = signal(false);

  originSuggestions = computed(() => this.matchCities(this.sourceCities(), this.originValue()));
  destinationSuggestions = computed(() => this.matchCities(this.destinationCities(), this.destinationValue()));

  /** Typed text that doesn't match any city, shown once the field loses focus. */
  originUnknown = computed(
    () => !this.showOriginSuggestions() && this.originValue().trim().length > 0 && !this.originCityId() && this.sourceCities().length > 0,
  );
  destinationUnknown = computed(
    () =>
      !this.showDestinationSuggestions() &&
      this.destinationValue().trim().length > 0 &&
      !!this.originCityId() &&
      !this.destinationCityId() &&
      !this.loadingDestinations(),
  );

  constructor(private router: Router) {
    this.loadSourceCities();

    effect(() => {
      const origin = this.origin();
      const destination = this.destination();
      const originId = this.originId();
      const destinationId = this.destinationId();
      const iso = this.date() || todayDateString();
      untracked(() => {
        this.originValue.set(origin);
        this.destinationValue.set(destination);
        this.originCityId.set(originId);
        this.destinationCityId.set(destinationId);
        this.dateValue.set(iso);
        this.dateDisplayValue.set(this.isoToDisplay(iso));
        this.dateError.set(null);
        if (originId) {
          this.loadDestinations(originId);
        }
      });
    });
  }

  private async loadSourceCities(): Promise<void> {
    this.citiesError.set('');
    try {
      const cities = await this.travler.getCities();
      this.sourceCities.set(cities);
      // A name that arrived without an id (e.g. a Popular Route link) still
      // resolves once the list is in.
      if (!this.originCityId()) {
        this.onOriginInput(this.originValue());
      }
    } catch (error) {
      this.citiesError.set(travlerErrorMessage(error, "We couldn't load the list of cities."));
    }
  }

  private async loadDestinations(sourceId: string): Promise<void> {
    this.loadingDestinations.set(true);
    try {
      const cities = await this.travler.getCities(sourceId);
      if (this.originCityId() !== sourceId) {
        return;
      }
      this.destinationCities.set(cities);
      const current = this.destinationCityId();
      if (current && !cities.some((city) => city.id === current)) {
        this.destinationCityId.set('');
      }
      if (!this.destinationCityId()) {
        this.onDestinationInput(this.destinationValue());
      }
    } catch (error) {
      this.citiesError.set(travlerErrorMessage(error, "We couldn't load destinations for that city."));
    } finally {
      if (this.originCityId() === sourceId) {
        this.loadingDestinations.set(false);
      }
    }
  }

  private matchCities(cities: City[], query: string): City[] {
    const q = query.trim().toLowerCase();
    const matches = q ? cities.filter((city) => city.name.toLowerCase().startsWith(q)) : cities;
    return matches.slice(0, MAX_SUGGESTIONS);
  }

  private findCity(cities: City[], name: string): City | undefined {
    const q = name.trim().toLowerCase();
    return q ? cities.find((city) => city.name.toLowerCase() === q) : undefined;
  }

  /** Typing an exact city name counts as picking it. */
  onOriginInput(value: string): void {
    this.originValue.set(value);
    const match = this.findCity(this.sourceCities(), value);
    this.setOriginId(match?.id ?? '');
  }

  onDestinationInput(value: string): void {
    this.destinationValue.set(value);
    const match = this.findCity(this.destinationCities(), value);
    this.destinationCityId.set(match?.id ?? '');
  }

  private setOriginId(id: string): void {
    if (id === this.originCityId()) {
      return;
    }
    this.originCityId.set(id);
    this.destinationCities.set([]);
    this.destinationCityId.set('');
    if (id) {
      this.loadDestinations(id);
    } else {
      this.loadingDestinations.set(false);
    }
  }

  selectOrigin(city: City): void {
    this.originValue.set(city.name);
    this.setOriginId(city.id);
    this.showOriginSuggestions.set(false);
  }

  selectDestination(city: City): void {
    this.destinationValue.set(city.name);
    this.destinationCityId.set(city.id);
    this.showDestinationSuggestions.set(false);
  }

  get sameOriginDestination(): boolean {
    return !!this.originCityId() && this.originCityId() === this.destinationCityId();
  }

  get canSearch(): boolean {
    return !!this.originCityId() && !!this.destinationCityId() && !this.sameOriginDestination && !this.dateError();
  }

  /** Reformats the dd/mm/yyyy mask as the user types and keeps the caret in place. */
  onDateInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const rawValue = inputEl.value;
    const cursorPos = inputEl.selectionStart ?? rawValue.length;
    const digitsBeforeCursor = rawValue.slice(0, cursorPos).replace(/\D/g, '').length;

    const digits = rawValue.replace(/\D/g, '').slice(0, 8);
    const formatted = this.digitsToDisplay(digits);

    this.dateDisplayValue.set(formatted);
    this.dateError.set(this.validateDate(digits));

    if (digits.length === 8 && !this.dateError()) {
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      this.dateValue.set(`${year}-${month}-${day}`);
    }

    // Wait for Angular to write the reformatted value into the DOM before
    // moving the caret, otherwise it gets reset to the end by the re-render.
    setTimeout(() => {
      let digitCount = 0;
      let newCursor = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (digitCount === digitsBeforeCursor) {
          newCursor = i;
          break;
        }
        if (/\d/.test(formatted[i])) {
          digitCount++;
        }
      }
      inputEl.setSelectionRange(newCursor, newCursor);
    });
  }

  onDateFocus(): void {
    this.syncCalendarToSelection();
    this.showCalendar.set(true);
  }

  onDateBlur(): void {
    this.showCalendar.set(false);
  }

  toggleCalendar(): void {
    if (this.showCalendar()) {
      this.showCalendar.set(false);
      return;
    }
    this.syncCalendarToSelection();
    this.showCalendar.set(true);
  }

  private syncCalendarToSelection(): void {
    const [year, month] = (this.dateValue() || todayDateString()).split('-').map(Number);
    this.calendarViewYear.set(year);
    this.calendarViewMonth.set(month - 1);
  }

  prevMonth(): void {
    if (this.isPrevMonthDisabled()) {
      return;
    }
    let month = this.calendarViewMonth() - 1;
    let year = this.calendarViewYear();
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    this.calendarViewYear.set(year);
    this.calendarViewMonth.set(month);
  }

  nextMonth(): void {
    let month = this.calendarViewMonth() + 1;
    let year = this.calendarViewYear();
    if (month > 11) {
      month = 0;
      year += 1;
    }
    this.calendarViewYear.set(year);
    this.calendarViewMonth.set(month);
  }

  selectDate(iso: string): void {
    if (iso < this.minDate) {
      return;
    }
    this.dateValue.set(iso);
    this.dateDisplayValue.set(this.isoToDisplay(iso));
    this.dateError.set(null);
    this.showCalendar.set(false);
  }

  private digitsToDisplay(digits: string): string {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    let out = day;
    if (digits.length > 2) out += '/' + month;
    if (digits.length > 4) out += '/' + year;
    return out;
  }

  private isoToDisplay(iso: string): string {
    const [year, month, day] = iso.split('-');
    return year && month && day ? `${day}/${month}/${year}` : '';
  }

  private validateDate(digits: string): string | null {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);

    if (day.length === 2 && (Number(day) < 1 || Number(day) > 31)) {
      return 'Enter a valid day (1–31).';
    }
    if (month.length === 2 && (Number(month) < 1 || Number(month) > 12)) {
      return 'Enter a valid month (1–12).';
    }
    if (digits.length < 8) {
      return null;
    }

    const dayNum = Number(day);
    const monthNum = Number(month);
    const yearNum = Number(year);
    const parsed = new Date(yearNum, monthNum - 1, dayNum);
    const isRealDate =
      parsed.getFullYear() === yearNum &&
      parsed.getMonth() === monthNum - 1 &&
      parsed.getDate() === dayNum;

    if (!isRealDate) {
      return "That date doesn't exist.";
    }
    if (`${year}-${month}-${day}` < this.minDate) {
      return "Date can't be in the past.";
    }
    return null;
  }

  search(): void {
    if (!this.canSearch) {
      return;
    }
    this.router.navigate(['/results'], {
      queryParams: {
        origin: this.originValue().trim(),
        destination: this.destinationValue().trim(),
        originId: this.originCityId(),
        destinationId: this.destinationCityId(),
        journeyDate: this.dateValue().trim() || todayDateString(),
      },
    });
  }
}
