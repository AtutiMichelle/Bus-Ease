import { Injectable, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { City } from '../models/trip.model';
import { TRIP_PROVIDER } from '../trips/trip-provider.token';
import { tripErrorMessage } from '../trips/trip-errors';
import { todayDateString } from '../utils/date';
import { ListenProblem, SpeechService } from './speech.service';
import { findCities, isoPlusDays, parseDate, saysCancel, saysHello, saysNo, saysYes, spokenDate, weekdayName } from './voice-parse';
import { ChatMessage, ModelStep, ToolCall, VoiceModelService } from './voice-model.service';
import { VoiceAction, VoiceField, VoiceStateService } from './voice-state.service';
import { VoiceReply, VoiceStep, VoiceStepModel, VoiceStepsService, VoiceToolResult } from './voice-steps.service';
import { cityName } from '../utils/city-name';

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

type Reply = VoiceReply;

/** How long a reply stays up to be read, for each letter in it. */
const READING_MS_PER_LETTER = 60;

/** The model's words in the plain form the rest of the app uses, so they
 * read and sound the same: "3,520" for an amount it wrote with a space,
 * and ordinary hyphens and quotes. */
export function tidyWords(text: string): string {
  return text
    .replace(/(\d)[\u00a0\u2009\u202f ](?=\d{3}(?!\d))/g, '$1,')
    .replace(/[\u2010\u2011]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u00a0\u2009\u202f]/g, ' ');
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
/** How much of a page the model is sent. */
const MAX_CONTEXT_CHARS = 2400;
/** On a booking page, an answer this short is plain enough for the fixed
 * rules, which reply at once. Longer ones go to the model. */
const QUICK_WORDS = 4;
/** Words that make something said on Home a question for the model rather
 * than a plain "from, to, date" for the fixed rules. */
const ASKS_SOMETHING =
  /\?|\b(what|which|how|when|why|who|is there|are there|can|could|do|does|price|prices|fare|fares|cost|cheap\w*|time|times|seats?|operators?|companies|buses)\b/i;

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
 * listening, works out what the user wants and answers.
 *
 * On Home it handles the search: where from, where to and when. An AI model
 * writes those replies and decides what to look up. It can only ask for the
 * tools in runTool, which read the live trip source, so cities, times and
 * prices are never made up. When the model can't be reached, the built-in
 * replies in ruleReply carry the same conversation on.
 *
 * From the results page on, each booking page has its own step (see
 * voice/steps) that reads what is on that page and answers by fixed rules,
 * so seats, names and payment never depend on the model. */
@Injectable({ providedIn: 'root' })
export class VoiceAssistantService {
  private voice = inject(VoiceStateService);
  private speech = inject(SpeechService);
  private trips = inject(TRIP_PROVIDER);
  private router = inject(Router);
  private model = inject(VoiceModelService);
  private steps = inject(VoiceStepsService);

  /** The booking step the conversation is on, if any. */
  private step: VoiceStep | null = null;
  /** The step's stage when it last spoke for itself, or null if it has not. */
  private introducedAt: string | null = null;

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
          this.step?.reset();
          this.introducedAt = null;
        });
      }
    });

    // Each booking page speaks first: on arriving, once it has loaded, and
    // again whenever it moves on by itself.
    effect(() => {
      const step = this.steps.active();
      const open = this.voice.open();
      const stage = step?.ready() ? (step.stage?.() ?? '') : null;
      untracked(() => this.followStep(step, open, stage));
    });
  }

  /** `stage` is null while the step's page is still loading. */
  private followStep(step: VoiceStep | null, open: boolean, stage: string | null): void {
    if (step !== this.step) {
      this.step = step;
      this.introducedAt = null;
      // The model starts each page fresh, with that page in front of it.
      this.chat = [];
      if (open) {
        // Each page is its own step, so the last one's messages go.
        this.turn++;
        this.speech.stopSpeech();
        this.voice.clearMessages();
      }
    }
    if (stage === null) {
      this.introducedAt = null;
      return;
    }
    if (!step || !open || stage === this.introducedAt) {
      return;
    }
    const first = this.introducedAt === null;
    this.introducedAt = stage;
    const reply = step.intro();
    if (reply) {
      void this.show(reply, ++this.turn, first);
    }
  }

  /** Opens or closes the mic to match what the panel shows. */
  private syncMic(): void {
    const wanted = this.voice.listening();
    if (wanted && !this.speech.listening) {
      this.speech.stopSpeech();
      this.speech.listen(
        {
          onDraft: (text) => this.showHeard(text, true),
          onFinal: (text) => {
            this.showHeard(text, false);
            this.voice.setState({ mode: 'idle' });
            void this.answer(text);
          },
          onProblem: (problem) => this.micStopped(problem),
        },
        { patient: this.step?.patient?.() ?? false },
      );
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
    const step = this.step;
    let reply: Reply | 'search' | null;
    try {
      reply = await this.reply(text);
    } catch (error) {
      reply = { text: tripErrorMessage(error, step ? 'Something went wrong. Please try again.' : "I couldn't load the list of cities.") };
    }
    if (turn !== this.turn || !this.voice.open()) {
      return;
    }

    if (reply === 'search') {
      this.search();
    } else if (reply) {
      await this.show(reply, turn);
    }
  }

  /** Adds the assistant's reply to the conversation and, when the user is
   * speaking rather than typing, reads it aloud and listens again. `fresh`
   * starts the conversation over with this reply. */
  private async show(reply: Reply, turn: number, fresh = false): Promise<void> {
    const spoken = this.voice.inputMode() === 'voice';
    const restMode = reply.confirm ? 'confirm' : 'idle';
    this.voice.setState({
      mode: spoken ? 'speaking' : restMode,
      messages: [
        ...(fresh ? [] : this.voice.messages()),
        { id: this.voice.nextId(), from: 'bot', text: reply.text, chips: reply.chips, actions: reply.actions },
      ],
      ...(this.step ? {} : this.searchFields()),
    });
    this.syncMic();
    const shownAt = Date.now();
    if (spoken) {
      await this.speech.speak(reply.say ?? reply.text);
      // Tapping the mic or closing the panel cuts the speech short and has
      // already moved things on.
      if (turn !== this.turn || this.voice.mode() !== 'speaking') {
        return;
      }
      // The mic opens again after a yes or no question too, so the answer
      // can be said as well as tapped.
      this.voice.setState({ mode: reply.listen === false ? restMode : 'listening' });
      this.syncMic();
    }
    if (!reply.handover) {
      return;
    }

    // A typed reply, or speech the browser would not play, still gets time
    // to be read before the panel goes.
    const readingMs = reply.text.length * READING_MS_PER_LETTER - (Date.now() - shownAt);
    await new Promise((resolve) => setTimeout(resolve, readingMs));
    // Typing, tapping the mic or closing the panel has already moved on.
    if (turn === this.turn && this.voice.open() && this.voice.mode() === restMode) {
      this.voice.closePanel();
    }
  }

  private async reply(text: string): Promise<Reply | 'search' | null> {
    if (this.step) {
      return this.step.ready() ? this.stepReply(this.step, text) : { text: 'One moment, this page is still loading.' };
    }
    if (this.router.url.split(/[?#]/)[0] !== '/') {
      return { text: 'I can help you book from the home page. Start a search there and I will take you through it.' };
    }

    // The two buttons under a finished search need no thinking about.
    if (this.ready() && /^\W*(search buses|search|yes)\W*$/i.test(text)) {
      return 'search';
    }
    if (this.ready() && /^\W*(edit|no)\W*$/i.test(text)) {
      this.chat.push({ role: 'user', content: text }, { role: 'assistant', content: CHANGE_REPLY });
      return { text: CHANGE_REPLY };
    }

    // A plain "from, to, date" is answered at once by the fixed rules. The
    // model takes questions, and whatever the rules do not understand.
    const modelOn = this.modelOn();
    if (!modelOn || !ASKS_SOMETHING.test(text)) {
      const reply = await this.ruleReply(text, modelOn);
      if (reply) {
        return this.remembered(text, reply);
      }
    }
    try {
      return await this.modelReply(text);
    } catch (error) {
      this.restModel(error);
    }
    return this.remembered(text, (await this.ruleReply(text, false)) as Reply | 'search');
  }

  /** Answers on a booking page: the page's own rules for short, plain
   * answers, and the model, where the page allows it, for the rest. */
  private async stepReply(step: VoiceStep, text: string): Promise<Reply | null> {
    const model = this.modelOn() ? step.model : undefined;
    const quick = text.trim().split(/\s+/).length <= QUICK_WORDS;

    let ruled = false;
    if (!model || quick) {
      ruled = true;
      const reply = await step.answer(text);
      if (reply !== undefined) {
        return model || step.model ? this.remembered(text, reply) : reply;
      }
    }
    if (model) {
      try {
        return await this.stepModelReply(model, text);
      } catch (error) {
        this.restModel(error);
      }
      if (!ruled) {
        const reply = await step.answer(text);
        if (reply !== undefined) {
          return this.remembered(text, reply);
        }
      }
    }
    return step.unsure();
  }

  private modelOn(): boolean {
    return this.model.enabled && Date.now() >= this.modelOffUntil;
  }

  private restModel(error: unknown): void {
    console.warn('Voice assistant model unavailable, using built-in replies', error);
    this.modelOffUntil = Date.now() + MODEL_REST_MS;
  }

  /** Keeps an exchange the fixed rules handled, so the model knows what
   * was said when it next answers. */
  private remembered<T extends Reply | 'search' | null>(text: string, reply: T): T {
    if (reply && reply !== 'search') {
      this.chat.push({ role: 'user', content: text.slice(0, MAX_USER_CHARS) }, { role: 'assistant', content: reply.text });
    }
    return reply;
  }

  /** Lets the model answer on Home, running the tools it asks for. */
  private async modelReply(text: string): Promise<Reply | 'search'> {
    const reply = await this.askModel(text, 'search', undefined, (name, args) => this.runTool(name, args));
    if (reply === null) {
      return 'search';
    }
    // The words are the model's. The quick replies and buttons still come
    // from what the trip is missing.
    return { ...(await this.nextQuestion()), text: reply };
  }

  /** Lets the model answer on a booking page, with that page in front of
   * it and that page's tools. */
  private async stepModelReply(model: VoiceStepModel, text: string): Promise<Reply | null> {
    let farewell: Reply | null = null;
    const context = () => JSON.stringify(model.context()).slice(0, MAX_CONTEXT_CHARS);
    const reply = await this.askModel(text, model.name, context, async (name, args) => {
      const result = await model.runTool(name, args);
      farewell = result.reply ?? farewell;
      return result;
    });
    return reply === null ? farewell : { ...model.prompts(), text: reply };
  }

  /** Asks the model, running each tool it asks for, until it has words to
   * say. Null when a tool moved to another page instead. */
  private async askModel(
    text: string,
    step: ModelStep,
    context: (() => string) | undefined,
    run: (name: string, args: Record<string, unknown>) => Promise<VoiceToolResult>,
  ): Promise<string | null> {
    const start = this.chat.length;
    this.chat.push({ role: 'user', content: text.slice(0, MAX_USER_CHARS) });
    try {
      for (let ask = 0; ask < MAX_MODEL_STEPS; ask++) {
        const message = await this.model.ask(this.recentChat(), todayDateString(), step, context?.());
        if (!message.tool_calls?.length) {
          const content = tidyWords(message.content);
          this.chat.push({ role: 'assistant', content });
          return content;
        }

        this.chat.push({ role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls });
        let leaving = false;
        for (const call of message.tool_calls) {
          const { leaving: left, reply: _reply, ...result } = await this.runCall(call, run);
          leaving ||= !!left;
          this.chat.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
          });
        }
        if (leaving) {
          return null;
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
  private async runCall(
    call: ToolCall,
    run: (name: string, args: Record<string, unknown>) => Promise<VoiceToolResult>,
  ): Promise<VoiceToolResult> {
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || '{}');
      if (typeof parsed === 'object' && parsed !== null) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Treated as no arguments.
    }
    try {
      return await run(call.function.name, args);
    } catch (error) {
      return { error: tripErrorMessage(error, 'The booking service could not be reached.') };
    }
  }

  /** The Home search tools. */
  private async runTool(name: string, args: Record<string, unknown>): Promise<VoiceToolResult> {
    const word = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    switch (name) {
      case 'get_cities':
        return this.citiesTool(word(args['from']));
      case 'set_trip':
        return this.setTripTool(word(args['from']), word(args['to']), word(args['date']));
      case 'find_buses':
        return this.busesTool();
      case 'show_results':
        return this.ready() ? { ok: true, leaving: true } : { ok: false, missing: this.missing() };
      default:
        return { error: 'Unknown tool' };
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
   * answers are understood. With `onlyIfUnderstood`, gives nothing back
   * when it did not understand, so the model can answer instead. */
  private async ruleReply(text: string, onlyIfUnderstood: boolean): Promise<Reply | 'search' | undefined> {
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
    if (!understood && onlyIfUnderstood) {
      return undefined;
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
          ? `Going to ${cityName(trip.destinationName)}. Where are you leaving from?`
          : 'Where are you leaving from?',
        chips: this.cityChips(sources),
      };
    }

    const origin = trip.origin;
    if (!trip.destination) {
      const destinations = (await this.trips.getCities(origin.id)).filter((city) => city.id !== origin.id);
      if (destinations.length === 0) {
        trip.origin = undefined;
        return { text: `I couldn't find any buses leaving from ${cityName(origin.name)}. Where else could you leave from?` };
      }
      const missing = trip.destinationName;
      trip.destinationName = undefined;
      return {
        text: missing
          ? `I couldn't find buses from ${cityName(origin.name)} to ${cityName(missing)}. Where would you like to go?`
          : `Leaving from ${cityName(origin.name)}. Where are you going?`,
        chips: this.cityChips(destinations),
      };
    }

    const route = `${cityName(origin.name)} to ${cityName(trip.destination.name)}`;
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
    return cities.slice(0, MAX_CHIPS).map((city) => cityName(city.name));
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
    // The panel stays open: the results page carries the conversation on.
    this.trip = {};
    this.chat = [];
    this.voice.setState({ mode: 'idle', filledFields: [], fieldText: {} });
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
