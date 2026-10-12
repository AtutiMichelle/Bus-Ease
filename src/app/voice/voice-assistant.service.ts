import { Injectable, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { City } from '../models/trip.model';
import { TRIP_PROVIDER } from '../trips/trip-provider.token';
import { tripErrorMessage } from '../trips/trip-errors';
import { todayDateString } from '../utils/date';
import { ListenProblem, SpeechService } from './speech.service';
import { findCities, isoPlusDays, parseDate, saysCancel, saysHello, saysNo, saysYes, spokenDate, weekdayName } from './voice-parse';
import { ChatMessage, ToolCall, VoiceModelService } from './voice-model.service';
import { VoiceAction, VoiceField, VoiceStateService } from './voice-state.service';

/** What the user has asked for so far. */
interface TripRequest {
  origin?: City;
  destination?: City;
  /** A destination that was named but is not matched to a city yet, either
   * because the origin is still unknown or no bus goes there from it. */
  destinationName?: string;
  /** yyyy-mm-dd */
  date?: string;
}

interface Reply {
  text: string;
  chips?: string[];
  actions?: VoiceAction[];
  /** The reply asks the user to confirm the search. */
  confirm?: boolean;
}

/** How many cities to offer as quick replies. */
const MAX_CHIPS = 3;

/** How many times the model may be asked within one answer. Each tool it
 * uses costs one more ask. */
const MAX_MODEL_STEPS = 4;
/** How much of the conversation is sent to the model. */
const MAX_CHAT_MESSAGES = 12;
const MAX_USER_CHARS = 400;
const MAX_TOOL_RESULT_CHARS = 2000;
/** How many cities or buses a tool hands back to the model. */
const MAX_TOOL_CITIES = 30;
const MAX_TOOL_BUSES = 6;
/** After the model fails, the built-in replies take over for this long. */
const MODEL_REST_MS = 60_000;

const CHANGE_REPLY = 'What would you like to change? Tell me the route or the date.';

const SEARCH_ACTIONS: VoiceAction[] = [
  { label: 'Search buses', primary: true },
  { label: 'Edit', primary: false },
];

const MIC_PROBLEMS: Record<Exclude<ListenProblem, 'silence'>, string> = {
  blocked: "I can't use the microphone. Allow it in your browser, or type your answer here.",
  'no-mic': "I couldn't find a microphone. You can type your answer here instead.",
  network: "I couldn't reach the speech service. You can type your answer here instead.",
};

/** The voice assistant itself: it listens while the panel says it is
 * listening, works out what the user wants, fills the search fields and
 * answers. For now it handles the Home search only: where from, where to
 * and when.
 *
 * An AI model writes the replies and decides what to look up. It can only
 * ask for the tools in runTool, which read the live trip source, so cities,
 * times and prices are never made up. When the model can't be reached, the
 * built-in replies in ruleReply carry the same conversation on. */
@Injectable({ providedIn: 'root' })
export class VoiceAssistantService {
  private voice = inject(VoiceStateService);
  private speech = inject(SpeechService);
  private trips = inject(TRIP_PROVIDER);
  private router = inject(Router);
  private model = inject(VoiceModelService);

  private trip: TripRequest = {};
  /** The conversation as the model sees it. */
  private chat: ChatMessage[] = [];
  private modelOffUntil = 0;
  /** The message showing what is being heard right now, if any. */
  private draftId: number | null = null;
  /** Counts answers, so a slow one is dropped once a newer one has started. */
  private turn = 0;

  constructor() {
    this.voice.onUserText((text) => void this.answer(text));

    effect(() => {
      this.voice.listening();
      untracked(() => this.syncMic());
    });

    // Closing the panel ends the conversation.
    effect(() => {
      if (!this.voice.open()) {
        untracked(() => {
          this.trip = {};
          this.chat = [];
          this.turn++;
          this.speech.stopSpeech();
        });
      }
    });
  }

  /** Opens or closes the mic to match what the panel shows. */
  private syncMic(): void {
    const wanted = this.voice.listening();
    if (wanted && !this.speech.listening) {
      this.speech.stopSpeech();
      this.speech.listen({
        onDraft: (text) => this.showHeard(text, true),
        onFinal: (text) => {
          this.showHeard(text, false);
          this.voice.setState({ mode: 'idle' });
          void this.answer(text);
        },
        onProblem: (problem) => this.micStopped(problem),
      });
    } else if (!wanted) {
      this.speech.stopListening();
      if (this.draftId !== null) {
        // The mic was turned off mid-sentence, so the half-heard words go.
        this.voice.setState({ messages: this.voice.messages().filter((message) => message.id !== this.draftId) });
        this.draftId = null;
      }
    }
  }

  /** Shows the words as they are heard, in one message that updates. */
  private showHeard(text: string, draft: boolean): void {
    const messages = this.voice.messages();
    if (this.draftId === null) {
      this.draftId = this.voice.nextId();
      this.voice.setState({ messages: [...messages, { id: this.draftId, from: 'user', text, draft }] });
    } else {
      this.voice.setState({
        messages: messages.map((message) => (message.id === this.draftId ? { ...message, text, draft } : message)),
      });
    }
    if (!draft) {
      this.draftId = null;
    }
  }

  private micStopped(problem: ListenProblem): void {
    if (!this.voice.listening()) {
      return;
    }
    if (problem === 'silence') {
      this.voice.setState({ mode: 'idle' });
      this.syncMic();
      return;
    }
    this.voice.setState({
      mode: 'idle',
      inputMode: 'text',
      messages: [...this.voice.messages(), { id: this.voice.nextId(), from: 'bot', text: MIC_PROBLEMS[problem] }],
    });
    this.syncMic();
  }

  private async answer(text: string): Promise<void> {
    if (saysCancel(text)) {
      this.voice.closePanel();
      return;
    }

    const turn = ++this.turn;
    let reply: Reply | 'search';
    try {
      reply = await this.reply(text);
    } catch (error) {
      reply = { text: tripErrorMessage(error, "I couldn't load the list of cities.") };
    }
    if (turn !== this.turn || !this.voice.open()) {
      return;
    }

    if (reply === 'search') {
      this.search();
      return;
    }

    const spoken = this.voice.inputMode() === 'voice';
    const restMode = reply.confirm ? 'confirm' : 'idle';
    this.voice.setState({
      mode: spoken ? 'speaking' : restMode,
      messages: [
        ...this.voice.messages(),
        { id: this.voice.nextId(), from: 'bot', text: reply.text, chips: reply.chips, actions: reply.actions },
      ],
      ...this.searchFields(),
    });
    if (!spoken) {
      return;
    }

    await this.speech.speak(reply.text);
    // Tapping the mic or closing the panel cuts the speech short and has
    // already moved things on.
    if (turn !== this.turn || this.voice.mode() !== 'speaking') {
      return;
    }
    this.voice.setState({ mode: reply.confirm ? 'confirm' : 'listening' });
    this.syncMic();
  }

  private async reply(text: string): Promise<Reply | 'search'> {
    if (this.router.url.split(/[?#]/)[0] !== '/') {
      return { text: 'I can only help with searching for buses from the home page for now.' };
    }

    // The two buttons under a finished search need no thinking about.
    if (this.ready() && /^\W*(search buses|yes)\W*$/i.test(text)) {
      return 'search';
    }
    if (this.ready() && /^\W*(edit|no)\W*$/i.test(text)) {
      this.chat.push({ role: 'user', content: text }, { role: 'assistant', content: CHANGE_REPLY });
      return { text: CHANGE_REPLY };
    }

    if (this.model.enabled && Date.now() >= this.modelOffUntil) {
      try {
        return await this.modelReply(text);
      } catch (error) {
        console.warn('Voice assistant model unavailable, using built-in replies', error);
        this.modelOffUntil = Date.now() + MODEL_REST_MS;
      }
    }

    const reply = await this.ruleReply(text);
    if (reply !== 'search') {
      // Kept so the model knows what was said once it is back.
      this.chat.push({ role: 'user', content: text.slice(0, MAX_USER_CHARS) }, { role: 'assistant', content: reply.text });
    }
    return reply;
  }

  /** Lets the model answer, running the tools it asks for along the way. */
  private async modelReply(text: string): Promise<Reply | 'search'> {
    const start = this.chat.length;
    this.chat.push({ role: 'user', content: text.slice(0, MAX_USER_CHARS) });
    try {
      for (let step = 0; step < MAX_MODEL_STEPS; step++) {
        const message = await this.model.ask(this.recentChat(), todayDateString());
        if (!message.tool_calls?.length) {
          this.chat.push({ role: 'assistant', content: message.content });
          // The words are the model's. The quick replies and buttons still
          // come from what the trip is missing.
          return { ...(await this.nextQuestion()), text: message.content };
        }

        this.chat.push({ role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls });
        let search = false;
        for (const call of message.tool_calls) {
          const result = await this.runTool(call);
          search ||= call.function.name === 'show_results' && result['ok'] === true;
          this.chat.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
          });
        }
        if (search) {
          return 'search';
        }
      }
      throw new Error('The assistant used too many steps');
    } catch (error) {
      // A half-finished answer would confuse the model later.
      this.chat.length = start;
      throw error;
    }
  }

  /** The newest part of the conversation, starting at something the user
   * said so no tool result is cut off from the request it answers. */
  private recentChat(): ChatMessage[] {
    const recent = this.chat.slice(-MAX_CHAT_MESSAGES);
    const firstUser = recent.findIndex((message) => message.role === 'user');
    return recent.slice(Math.max(firstUser, 0));
  }

  /** Runs one tool the model asked for and returns what to tell it. */
  private async runTool(call: ToolCall): Promise<Record<string, unknown>> {
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || '{}');
      if (typeof parsed === 'object' && parsed !== null) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Treated as no arguments.
    }
    const word = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

    try {
      switch (call.function.name) {
        case 'get_cities':
          return await this.citiesTool(word(args['from']));
        case 'set_trip':
          return await this.setTripTool(word(args['from']), word(args['to']), word(args['date']));
        case 'find_buses':
          return await this.busesTool();
        case 'show_results':
          return this.ready() ? { ok: true } : { ok: false, missing: this.missing() };
        default:
          return { error: 'Unknown tool' };
      }
    } catch (error) {
      return { error: tripErrorMessage(error, 'The booking service could not be reached.') };
    }
  }

  private async citiesTool(from: string): Promise<Record<string, unknown>> {
    const sources = await this.trips.getCities();
    const names = (cities: City[]) => cities.slice(0, MAX_TOOL_CITIES).map((city) => city.name);
    if (!from) {
      return { leaving_from: names(sources) };
    }
    const origin = this.matchCity(sources, from);
    if (!origin) {
      return { error: `No buses leave from ${from}.`, leaving_from: names(sources) };
    }
    const destinations = (await this.trips.getCities(origin.id)).filter((city) => city.id !== origin.id);
    return { from: origin.name, going_to: names(destinations) };
  }

  private async setTripTool(from: string, to: string, date: string): Promise<Record<string, unknown>> {
    const trip = this.trip;
    const problems: string[] = [];

    if (from) {
      const origin = this.matchCity(await this.trips.getCities(), from);
      if (!origin) {
        problems.push(`No buses leave from ${from}.`);
      } else if (origin.id !== trip.origin?.id) {
        trip.origin = origin;
        // The old destination may not be reachable from the new origin, so
        // it is looked up again below.
        trip.destinationName = trip.destination?.name ?? trip.destinationName;
        trip.destination = undefined;
      }
    }
    if (to) {
      trip.destinationName = to;
      trip.destination = undefined;
    }
    if (trip.origin && trip.destinationName) {
      const origin = trip.origin;
      const destinations = (await this.trips.getCities(origin.id)).filter((city) => city.id !== origin.id);
      trip.destination = this.matchCity(destinations, trip.destinationName);
      if (!trip.destination) {
        problems.push(`No buses go from ${origin.name} to ${trip.destinationName}.`);
      }
      trip.destinationName = undefined;
    }

    if (date) {
      const today = todayDateString();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseDate(date.split('-').reverse().join('/'), today) : parseDate(date, today);
      if (iso) {
        trip.date = iso;
      } else {
        problems.push(`${date} is not a date that can be booked. It may be in the past.`);
      }
    }

    return {
      from: trip.origin?.name ?? null,
      to: trip.destination?.name ?? trip.destinationName ?? null,
      date: trip.date ? `${weekdayName(trip.date)}, ${trip.date}` : null,
      missing: this.missing(),
      ...(problems.length ? { problems } : {}),
    };
  }

  private async busesTool(): Promise<Record<string, unknown>> {
    const { origin, destination, date } = this.trip;
    if (!origin || !destination || !date) {
      return { error: 'Set from, to and date first.', missing: this.missing() };
    }
    const buses = await this.trips.searchTrips({
      fromCityId: origin.id,
      toCityId: destination.id,
      from: origin.name,
      to: destination.name,
      date,
    });
    return {
      from: origin.name,
      to: destination.name,
      date,
      total: buses.length,
      buses: buses.slice(0, MAX_TOOL_BUSES).map((bus) => ({
        operator: bus.operator,
        departs: bus.departureTime,
        arrives: bus.arrivalTime,
        fare_kes: bus.fromPrice,
        seats_left: bus.seatsAvailable,
      })),
    };
  }

  /** The city with this name, or the first one named in a longer phrase. */
  private matchCity(cities: City[], name: string): City | undefined {
    const wanted = name.trim().toLowerCase();
    return cities.find((city) => city.name.toLowerCase() === wanted) ?? findCities(name, cities)[0]?.city;
  }

  private missing(): string[] {
    const missing: string[] = [];
    if (!this.trip.origin) {
      missing.push('from');
    }
    if (!this.trip.destination) {
      missing.push('to');
    }
    if (!this.trip.date) {
      missing.push('date');
    }
    return missing;
  }

  /** The built-in replies: fixed wording, and only cities, dates and short
   * answers are understood. */
  private async ruleReply(text: string): Promise<Reply | 'search'> {
    const wasReady = this.ready();
    const understood = await this.readTrip(text);
    if (wasReady && !understood) {
      if (saysNo(text)) {
        return { text: CHANGE_REPLY };
      }
      if (saysYes(text)) {
        return 'search';
      }
    }

    const question = await this.nextQuestion();
    if (!understood && saysHello(text)) {
      return { ...question, text: `Hello! ${question.text}` };
    }
    return understood ? question : { ...question, text: `Sorry, I didn't catch that. ${question.text}` };
  }

  private ready(): boolean {
    return !!this.trip.origin && !!this.trip.destination && !!this.trip.date;
  }

  /** Takes any cities and date out of the text. Returns whether it found
   * anything. */
  private async readTrip(text: string): Promise<boolean> {
    const trip = this.trip;
    let understood = false;

    const sources = await this.trips.getCities();
    const mentions = findCities(text, sources);

    // "from Nairobi" is always the origin. A bare city name is the origin
    // only while there is none yet.
    const originMention =
      mentions.find((mention) => mention.role === 'from') ??
      (trip.origin ? undefined : mentions.find((mention) => mention.role !== 'to'));
    if (originMention) {
      understood = true;
      if (originMention.city.id !== trip.origin?.id) {
        trip.origin = originMention.city;
        // The old destination may not be reachable from the new origin, so
        // it is looked up again below.
        trip.destinationName = trip.destination?.name ?? trip.destinationName;
        trip.destination = undefined;
      }
    }

    // Any other city named is where they want to go.
    const wanted = mentions.find(
      (mention) => mention !== originMention && mention.role !== 'from' && mention.city.id !== trip.origin?.id,
    );

    if (trip.origin) {
      const origin = trip.origin;
      const destinations = (await this.trips.getCities(origin.id)).filter((city) => city.id !== origin.id);
      const said = findCities(text, destinations).filter(
        (mention) => mention.role !== 'from' && mention.index !== originMention?.index,
      );
      const pick = said.find((mention) => mention.role === 'to') ?? said[0];
      if (pick || wanted) {
        understood = true;
      }

      const name = pick?.city.name ?? wanted?.city.name ?? trip.destinationName;
      if (name && name.toLowerCase() !== trip.destination?.name.toLowerCase()) {
        const match = pick?.city ?? destinations.find((city) => city.name.toLowerCase() === name.toLowerCase());
        trip.destination = match;
        trip.destinationName = match ? undefined : name;
      }
    } else if (wanted) {
      understood = true;
      trip.destinationName = wanted.city.name;
    }

    const date = parseDate(text, todayDateString());
    if (date) {
      understood = true;
      trip.date = date;
    }

    return understood;
  }

  /** Asks for the next missing piece, or to confirm once nothing is missing. */
  private async nextQuestion(): Promise<Reply> {
    const trip = this.trip;

    if (!trip.origin) {
      const sources = await this.trips.getCities();
      return {
        text: trip.destinationName
          ? `Going to ${trip.destinationName}. Where are you leaving from?`
          : 'Where are you leaving from?',
        chips: this.cityChips(sources),
      };
    }

    const origin = trip.origin;
    if (!trip.destination) {
      const destinations = (await this.trips.getCities(origin.id)).filter((city) => city.id !== origin.id);
      if (destinations.length === 0) {
        trip.origin = undefined;
        return { text: `I couldn't find any buses leaving from ${origin.name}. Where else could you leave from?` };
      }
      const missing = trip.destinationName;
      trip.destinationName = undefined;
      return {
        text: missing
          ? `I couldn't find buses from ${origin.name} to ${missing}. Where would you like to go?`
          : `Leaving from ${origin.name}. Where are you going?`,
        chips: this.cityChips(destinations),
      };
    }

    const route = `${origin.name} to ${trip.destination.name}`;
    if (!trip.date) {
      const today = todayDateString();
      return {
        text: `${route}. Which date are you travelling?`,
        chips: ['Today', 'Tomorrow', weekdayName(isoPlusDays(today, 2))],
      };
    }

    return {
      text: `Search buses from ${route} on ${spokenDate(trip.date)}?`,
      actions: SEARCH_ACTIONS,
      confirm: true,
    };
  }

  private cityChips(cities: City[]): string[] {
    return cities.slice(0, MAX_CHIPS).map((city) => city.name);
  }

  /** What the search card should show for the trip so far. */
  private searchFields(): { filledFields: VoiceField[]; fieldText: Partial<Record<VoiceField, string>> } {
    const fieldText: Partial<Record<VoiceField, string>> = {};
    if (this.trip.origin) {
      fieldText.origin = this.trip.origin.name;
    }
    if (this.trip.destination) {
      fieldText.destination = this.trip.destination.name;
    }
    if (this.trip.date) {
      fieldText.date = this.trip.date;
    }
    return { fieldText, filledFields: Object.keys(fieldText) as VoiceField[] };
  }

  private search(): void {
    const { origin, destination, date } = this.trip;
    if (!origin || !destination || !date) {
      return;
    }
    this.voice.closePanel();
    this.router.navigate(['/results'], {
      queryParams: {
        origin: origin.name,
        destination: destination.name,
        originId: origin.id,
        destinationId: destination.id,
        journeyDate: date,
      },
    });
  }
}
