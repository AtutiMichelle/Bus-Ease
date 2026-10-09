import { Component, computed, effect, inject, isDevMode, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { EMPTY_VOICE_STATE, VoiceMessage, VoiceState, VoiceStateService } from '../voice-state.service';

interface DemoState {
  label: string;
  state: Partial<VoiceState>;
}

/* The sample conversations, one message at a time. Ids stay the same from
   state to state so a message that carries over is not drawn again. They are
   negative so they can never clash with a message typed during the demo. */
const GREETING: VoiceMessage = { id: -1, from: 'bot', text: 'Where would you like to travel?' };
const ROUTE_DRAFT: VoiceMessage = { id: -2, from: 'user', text: 'I want to book a bus from Nairobi to Mom', draft: true };
const ROUTE: VoiceMessage = { id: -2, from: 'user', text: 'I want to book a bus from Nairobi to Mombasa' };
const ASK_DATE: VoiceMessage = {
  id: -3,
  from: 'bot',
  text: 'Nairobi to Mombasa. Which date are you travelling?',
  chips: ['Today', 'Tomorrow', 'Friday'],
};
const DATE: VoiceMessage = { id: -4, from: 'user', text: 'Tomorrow' };
const CONFIRM_SEARCH: VoiceMessage = {
  id: -5,
  from: 'bot',
  text: 'Search buses from Nairobi to Mombasa on Sat, 10 Oct?',
  actions: [
    { label: 'Search buses', primary: true },
    { label: 'Edit', primary: false },
  ],
};

const FOUND_BUSES: VoiceMessage = {
  id: -1,
  from: 'bot',
  text: 'I found 3 buses. Say a number, an operator or a time.',
  chips: ['Number 1', 'Dream Line', 'Morning'],
};
const PICK: VoiceMessage = { id: -2, from: 'user', text: 'Number two' };
const CONFIRM_BUS: VoiceMessage = {
  id: -3,
  from: 'bot',
  text: 'Coast Express, 9:00 PM, KES 1,800. Choose your seat?',
  actions: [
    { label: 'Choose seats', primary: true },
    { label: 'Back', primary: false },
  ],
};

/** Looks for the Home search card. */
const HOME_STATES: DemoState[] = [
  {
    label: 'a. Listening, still talking',
    state: { mode: 'listening', messages: [GREETING, ROUTE_DRAFT] },
  },
  {
    label: 'b. Speaking, asks for the date',
    state: {
      mode: 'speaking',
      messages: [GREETING, ROUTE, ASK_DATE],
      filledFields: ['origin', 'destination'],
      fieldText: { origin: 'Nairobi', destination: 'Mombasa' },
    },
  },
  {
    label: 'c. Listening, heard the date',
    state: { mode: 'listening', messages: [GREETING, ROUTE, ASK_DATE, DATE] },
  },
  {
    label: 'd. Confirm the search',
    state: {
      mode: 'confirm',
      messages: [GREETING, ROUTE, ASK_DATE, DATE, CONFIRM_SEARCH],
      filledFields: ['date'],
    },
  },
  {
    label: 'g. Typed the date instead',
    state: { mode: 'idle', inputMode: 'text', messages: [GREETING, ROUTE, ASK_DATE, DATE] },
  },
];

/** Looks for the Results page. */
const RESULTS_STATES: DemoState[] = [
  {
    label: 'e. Listening, pick a bus',
    state: { mode: 'listening', messages: [FOUND_BUSES] },
  },
  {
    label: 'f. Confirm the bus',
    state: { mode: 'confirm', messages: [FOUND_BUSES, PICK, CONFIRM_BUS], selectedCard: 2 },
  },
];

/** True when the app was opened with ?voiceDemo=1 in a dev build. Read once
 * at startup, so the demo stays on while moving between pages. */
export function voiceDemoEnabled(): boolean {
  return isDevMode() && new URLSearchParams(window.location.search).get('voiceDemo') === '1';
}

/** Dev-only button that steps the voice UI through sample states, so every
 * look can be reviewed without real speech. Home steps through a to d, then
 * g (a typed answer). Other pages start at the Results looks (e, f) and then
 * run the Home ones as well. */
@Component({
  selector: 'app-voice-demo',
  styleUrl: './voice-demo.css',
  templateUrl: './voice-demo.html',
})
export class VoiceDemo {
  private voice = inject(VoiceStateService);
  private router = inject(Router);

  private path = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0]),
    ),
    { initialValue: this.router.url.split('?')[0] },
  );

  private states = computed(() => (this.path() === '/' ? HOME_STATES : [...RESULTS_STATES, ...HOME_STATES]));

  /** Position in the cycle. -1 is the closed, idle look. */
  private index = signal(-1);

  label = computed(() => this.states()[this.index()]?.label ?? 'Idle, panel closed');

  constructor() {
    // A new page starts its own cycle from the top.
    effect(() => {
      this.path();
      this.index.set(-1);
    });
  }

  next(): void {
    const next = this.index() + 1;
    const sample = this.states()[next];
    if (!sample) {
      this.index.set(-1);
      this.voice.closePanel();
      return;
    }
    this.index.set(next);
    // Each sample is a whole look, so nothing carries over from the last one.
    this.voice.setState({ ...EMPTY_VOICE_STATE, open: true, ...sample.state });
  }
}
