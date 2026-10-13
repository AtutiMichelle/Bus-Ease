import { Trip } from '../../models/trip.model';
import { todayDateString } from '../../utils/date';
import { departureBucket } from '../../utils/bus-filters';
import { findByName, findNumbers, parseDate, parseHour, saysNo, saysYes, spokenDate } from '../voice-parse';
import { VoicePrompts, VoiceReply, VoiceStep, VoiceStepModel, VoiceToolResult } from '../voice-steps.service';

/** What the results page lets the assistant read and do. */
export interface ResultsControls {
  loading(): boolean;
  errorMessage(): string;
  /** The buses on screen, in card order. */
  trips(): Trip[];
  /** Marks a numbered card as the one being talked about, or none. */
  highlight(card: number | null): void;
  /** Opens the seat map for a bus. */
  openSeats(trip: Trip): void;
  changeDate(date: string): void;
}

const PICK_ACTIONS = [
  { label: 'Choose seats', primary: true },
  { label: 'Back', primary: false },
];

/** How many buses are read out when several match. */
const MAX_LISTED = 3;
/** How many buses the AI model is shown. */
const MAX_MODEL_BUSES = 12;

/** Words that make an answer a new travel date rather than a bus, so
 * "2 October" is not read as bus number 2. */
const DATE_WORDS =
  /\b(today|tonight|tomorrow|tomorow|(mon|tues|wednes|thurs|fri|satur|sun)day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d[/.-]\d/i;

function fare(amount: number): string {
  return `KES ${amount.toLocaleString('en-US')}`;
}

/** The buses the text could mean: by card number, operator, time of day,
 * or the cheapest, earliest or latest. Empty when it names none. */
export function findTrips(text: string, trips: Trip[]): Trip[] {
  const lower = text.toLowerCase();
  if (trips.length === 0) {
    return [];
  }

  const by = (score: (trip: Trip) => number) => [trips.reduce((best, trip) => (score(trip) < score(best) ? trip : best))];
  if (/\b(cheapest|lowest|least expensive)\b/.test(lower)) {
    return by((trip) => trip.fromPrice);
  }
  if (/\b(earliest|soonest)\b/.test(lower)) {
    return by((trip) => trip.departureHour);
  }
  if (/\b(latest|last)\b/.test(lower)) {
    return by((trip) => -trip.departureHour);
  }

  const hour = parseHour(text);
  if (hour !== null) {
    return trips.filter((trip) => trip.departureHour === hour);
  }

  const period = lower.match(/\b(morning|afternoon|evening|night)\b/)?.[1];
  let matches = period ? trips.filter((trip) => departureBucket(trip.departureHour).toLowerCase() === period) : trips;

  const operators = [...new Set(trips.map((trip) => trip.operator))].map((name) => ({ name }));
  const operator = findByName(text, operators);
  if (operator) {
    matches = matches.filter((trip) => trip.operator === operator.name);
  }
  if (period || operator) {
    return matches;
  }

  const card = findNumbers(text)[0];
  const picked = card ? trips[card - 1] : undefined;
  return picked ? [picked] : [];
}

/** Picking a bus on the results page. */
export class ResultsVoiceStep implements VoiceStep {
  /** The bus waiting for a yes before its seat map opens. */
  private pending?: Trip;

  constructor(private page: ResultsControls) {}

  /** Lets the AI model answer what the rules below do not understand, such
   * as "the cheaper one in the evening". */
  readonly model: VoiceStepModel = {
    name: 'buses',
    context: () => {
      const trips = this.page.trips();
      return {
        route: trips[0] ? `${trips[0].from} to ${trips[0].to}` : null,
        date: trips[0]?.date ?? null,
        buses: trips.slice(0, MAX_MODEL_BUSES).map((trip, index) => ({
          number: index + 1,
          operator: trip.operator,
          departs: trip.departureTime,
          arrives: trip.arrivalTime,
          takes: trip.duration,
          type: trip.busType,
          fare_from_kes: trip.fromPrice,
          seats_left: trip.seatsAvailable,
        })),
        more_buses_not_listed: Math.max(0, trips.length - MAX_MODEL_BUSES),
        marked_bus: this.pending ? trips.indexOf(this.pending) + 1 || null : null,
      };
    },
    runTool: async (name, args) => this.runTool(name, args),
    prompts: () => this.prompts(),
  };

  private runTool(name: string, args: Record<string, unknown>): VoiceToolResult {
    const trips = this.page.trips();
    const trip = trips[Number(args['number']) - 1];
    switch (name) {
      case 'mark_bus':
        if (!trip) {
          return { error: `There is no bus number ${args['number']}. Numbers run from 1 to ${trips.length}.` };
        }
        this.offer(trip);
        return { ok: true, marked_bus: trips.indexOf(trip) + 1, operator: trip.operator, departs: trip.departureTime };
      case 'open_seats':
        if (!trip) {
          return { error: `There is no bus number ${args['number']}. Numbers run from 1 to ${trips.length}.` };
        }
        this.reset();
        this.page.openSeats(trip);
        return { ok: true, leaving: true };
      case 'change_date': {
        const said = typeof args['date'] === 'string' ? args['date'] : '';
        const date = parseDate(said, todayDateString());
        if (!date) {
          return { error: `${said || 'That'} is not a date that can be booked. It may be in the past.` };
        }
        this.reset();
        this.page.changeDate(date);
        return { ok: true, leaving: true, reply: { text: `Looking for buses on ${spokenDate(date)}.`, listen: false } };
      }
      default:
        return { error: 'Unknown tool' };
    }
  }

  private prompts(): VoicePrompts {
    if (this.pending && this.page.trips().includes(this.pending)) {
      return { actions: PICK_ACTIONS, confirm: true };
    }
    return this.page.trips().length > 1 ? { chips: ['Number 1', 'Cheapest', 'Earliest'] } : {};
  }

  unsure(): VoiceReply {
    const count = this.page.trips().length;
    if (count === 0) {
      return { text: "Sorry, I didn't catch that. Tell me another date to try." };
    }
    return { text: `Sorry, I didn't catch that. Say a number from 1 to ${count}, an operator or a time.`, ...this.prompts() };
  }

  ready(): boolean {
    return !this.page.loading();
  }

  reset(): void {
    this.pending = undefined;
    this.page.highlight(null);
  }

  intro(): VoiceReply {
    this.reset();
    const trips = this.page.trips();
    if (this.page.errorMessage()) {
      return { text: `${this.page.errorMessage()} You can also tell me another date.` };
    }
    if (trips.length === 0) {
      return { text: 'I found no buses for this trip. Tell me another date to try.', chips: ['Tomorrow'] };
    }
    if (trips.length === 1) {
      return this.offer(trips[0], 'I found one bus. ');
    }
    return {
      text: `I found ${trips.length} buses. Say a number, an operator or a time.`,
      chips: ['Number 1', 'Cheapest', 'Earliest'],
    };
  }

  async answer(text: string): Promise<VoiceReply | null | undefined> {
    const trips = this.page.trips();

    const date = DATE_WORDS.test(text) ? parseDate(text, todayDateString()) : null;
    if (date) {
      this.reset();
      this.page.changeDate(date);
      return { text: `Looking for buses on ${spokenDate(date)}.`, listen: false };
    }

    const stillListed = this.pending && trips.includes(this.pending);
    const matches = findTrips(text, trips);
    if (stillListed && this.pending && matches.length === 0) {
      if (saysNo(text)) {
        this.reset();
        return { text: 'No problem. Which bus would you like? Say a number, an operator or a time.' };
      }
      if (saysYes(text) || /\b(choose|pick|select|seats?)\b/i.test(text)) {
        const trip = this.pending;
        this.reset();
        this.page.openSeats(trip);
        return null;
      }
    }

    if (matches.length === 1) {
      return this.offer(matches[0]);
    }
    if (matches.length > 1) {
      const listed = matches
        .slice(0, MAX_LISTED)
        .map((trip) => `number ${trips.indexOf(trip) + 1}, ${trip.operator} at ${trip.departureTime}`)
        .join('; ');
      return { text: `${matches.length} buses match: ${listed}. Which number?` };
    }

    return undefined;
  }

  /** Marks the bus and asks before opening its seats. */
  private offer(trip: Trip, lead = ''): VoiceReply {
    this.pending = trip;
    this.page.highlight(this.page.trips().indexOf(trip) + 1);
    return {
      text: `${lead}${trip.operator}, ${trip.departureTime}, from ${fare(trip.fromPrice)}. Choose your seat?`,
      actions: PICK_ACTIONS,
      confirm: true,
    };
  }
}
