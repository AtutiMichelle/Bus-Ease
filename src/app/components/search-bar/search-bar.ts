import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { todayDateString } from '../../utils/date';
import { TRIP_PROVIDER } from '../../trips/trip-provider.token';
import { tripErrorMessage } from '../../trips/trip-errors';
import { City } from '../../models/trip.model';
import { VoiceStateService } from '../../voice/voice-state.service';
import { VoiceMicButton } from '../../voice/voice-mic-button/voice-mic-button';
import { CityNamePipe, cityName } from '../../utils/city-name';

@Component({
  imports: [FormsModule, VoiceMicButton, CityNamePipe],
  selector: 'app-search-bar',
  styleUrl: './search-bar.css',
  templateUrl: './search-bar.html',
  host: {
    '[class.compact]': "variant() === 'compact'",
    '[class.ticket]': "variant() === 'ticket'",
    '(document:mousedown)': 'closeCalendarIfOutside($event)',
    '(document:focusin)': 'closeCalendarIfOutside($event)',
  },
})
export class SearchBar {
  variant = input<'hero' | 'compact' | 'ticket'>('hero');
  origin = input('', { alias: 'origin' });
  destination = input('', { alias: 'destination' });
  date = input('', { alias: 'date' });
  originId = input('', { alias: 'originId' });
  destinationId = input('', { alias: 'destinationId' });

  private tripProvider = inject(TRIP_PROVIDER);
  voice = inject(VoiceStateService);

  /** The mic sits in the Home search card only. The Results toolbar leaves
   * voice to the floating mic. */
  showVoiceMic = computed(() => this.variant() !== 'compact' && this.voice.supported());

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
  private dateField = viewChild<ElementRef<HTMLElement>>('dateField');
  private destinationInput = viewChild<ElementRef<HTMLInputElement>>('destinationInput');
  private searchButton = viewChild<ElementRef<HTMLButtonElement>>('searchButton');
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  /** Removes the keyboard listeners added while a city field has focus. */
  private stopKeyboardWatch: (() => void) | null = null;
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
        this.originValue.set(cityName(origin));
        this.destinationValue.set(cityName(destination));
        this.originCityId.set(originId);
        this.destinationCityId.set(destinationId);
        this.dateValue.set(iso);
        this.dateDisplayValue.set(this.isoToDisplay(iso));
        this.dateError.set(null);
        if (originId) {
          this.loadDestinations(originId);
        } else if (this.sourceCities().length > 0) {
          // The city list is already in, so loadSourceCities won't resolve
          // this name for us.
          this.onOriginInput(cityName(origin));
        }
      });
    });

    // What the voice assistant heard goes into the fields, the same as if
    // it had been typed or picked.
    effect(() => {
      const { origin, destination, date } = this.voice.fieldText();
      untracked(() => {
        if (origin && cityName(origin) !== this.originValue()) {
          this.onOriginInput(cityName(origin));
        }
        if (destination && cityName(destination) !== this.destinationValue()) {
          this.onDestinationInput(cityName(destination));
        }
        if (date && date !== this.dateValue()) {
          this.selectDate(date);
        }
      });
    });
  }

  private async loadSourceCities(): Promise<void> {
    this.citiesError.set('');
    try {
      const cities = await this.tripProvider.getCities();
      this.sourceCities.set(cities);
      // A name that arrived without an id (e.g. a Popular Route link) still
      // resolves once the list is in.
      if (!this.originCityId()) {
        this.onOriginInput(this.originValue());
      }
    } catch (error) {
      this.citiesError.set(tripErrorMessage(error, "We couldn't load the list of cities."));
    }
  }

  private async loadDestinations(sourceId: string): Promise<void> {
    this.loadingDestinations.set(true);
    try {
      const cities = await this.tripProvider.getCities(sourceId);
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
      this.citiesError.set(tripErrorMessage(error, "We couldn't load destinations for that city."));
    } finally {
      if (this.originCityId() === sourceId) {
        this.loadingDestinations.set(false);
      }
    }
  }

  private matchCities(cities: City[], query: string): City[] {
    const q = query.trim().toLowerCase();
    return q ? cities.filter((city) => city.name.toLowerCase().startsWith(q)) : cities;
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
    this.originValue.set(cityName(city.name));
    this.setOriginId(city.id);
    this.showOriginSuggestions.set(false);
    // Straight on to "To". It's still disabled until the next render, so
    // enable it here: focusing inside the tap keeps the phone keyboard open.
    const next = this.destinationInput()?.nativeElement;
    if (next) {
      next.disabled = false;
      next.focus();
    }
  }

  selectDestination(city: City): void {
    this.destinationValue.set(cityName(city.name));
    this.destinationCityId.set(city.id);
    this.showDestinationSuggestions.set(false);
    // On to the date: close the keyboard so the calendar isn't hidden by it.
    (document.activeElement as HTMLElement | null)?.blur();
    this.syncCalendarToSelection();
    this.showCalendar.set(true);
    this.scrollToTop(this.dateField()?.nativeElement.closest('.field'));
  }

  onCityFocus(field: 'origin' | 'destination', input: HTMLInputElement): void {
    (field === 'origin' ? this.showOriginSuggestions : this.showDestinationSuggestions).set(true);
    if (!this.isStacked()) {
      return;
    }
    const fieldEl = input.closest<HTMLElement>('.field');
    this.scrollToTop(fieldEl);
    this.watchKeyboard(input, fieldEl);
  }

  onCityBlur(field: 'origin' | 'destination'): void {
    (field === 'origin' ? this.showOriginSuggestions : this.showDestinationSuggestions).set(false);
    this.stopKeyboardWatch?.();
    this.stopKeyboardWatch = null;
  }

  /** Phones and small tablets, where the form is one column and the
   * on-screen keyboard covers its lower half. Matches search-bar.css. */
  private isStacked(): boolean {
    return window.matchMedia?.('(max-width: 860px)').matches ?? false;
  }

  /** Brings a field up to just under the fixed header, leaving room below
   * it for its dropdown or calendar. Phones and small tablets only. */
  private scrollToTop(el: Element | null | undefined): void {
    if (!el || !this.isStacked()) {
      return;
    }
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - Math.max(headerBottom, 0) - 8;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(top, 0), behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  /** While a city field has focus, keep it in view as the keyboard opens and
   * size its dropdown to the space left above the keyboard. */
  private watchKeyboard(input: HTMLInputElement, fieldEl: HTMLElement | null): void {
    this.stopKeyboardWatch?.();
    const viewport = window.visualViewport;
    const fit = () => this.fitSuggestions(input);
    const onResize = () => {
      this.scrollToTop(fieldEl);
      fit();
    };
    viewport?.addEventListener('resize', onResize);
    viewport?.addEventListener('scroll', fit);
    window.addEventListener('scroll', fit, { passive: true });
    fit();
    this.stopKeyboardWatch = () => {
      viewport?.removeEventListener('resize', onResize);
      viewport?.removeEventListener('scroll', fit);
      window.removeEventListener('scroll', fit);
      this.host.nativeElement.style.removeProperty('--suggestion-max-height');
    };
  }

  private fitSuggestions(input: HTMLInputElement): void {
    const viewport = window.visualViewport;
    const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    // 6px gap above the list, 14px of its own padding and border, and 12px
    // of breathing room above the keyboard.
    const space = Math.floor(visibleBottom - input.getBoundingClientRect().bottom - 32);
    const height = Math.max(120, Math.min(220, space));
    this.host.nativeElement.style.setProperty('--suggestion-max-height', `${height}px`);
  }

  /** After the date, show the Search button. */
  private scrollToSearch(): void {
    const button = this.searchButton()?.nativeElement;
    if (!button || !this.isStacked()) {
      return;
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    button.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
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
      // A full, valid date typed on a phone: close the keyboard and show Search.
      if (this.isStacked()) {
        inputEl.blur();
        this.scrollToSearch();
      }
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

  /** Opening the calendar from its icon never focuses the date input, so its
   * blur can't close it. Close it on any click or focus outside the date
   * field instead. */
  closeCalendarIfOutside(event: Event): void {
    const field = this.dateField()?.nativeElement;
    if (this.showCalendar() && field && !field.contains(event.target as Node)) {
      this.showCalendar.set(false);
    }
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

  /** A day tapped in the calendar. Voice uses selectDate, which doesn't scroll. */
  pickDate(iso: string): void {
    this.selectDate(iso);
    if (this.dateValue() === iso) {
      this.scrollToSearch();
    }
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
