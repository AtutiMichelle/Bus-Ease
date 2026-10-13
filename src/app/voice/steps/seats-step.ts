import { LayoutSeat, StopPoint, Trip } from '../../models/trip.model';
import { findByName, findNumbers, saysNo, saysYes } from '../voice-parse';
import { VoicePrompts, VoiceReply, VoiceStep, VoiceStepModel, VoiceToolResult } from '../voice-steps.service';

/** What the seat panel lets the assistant read and do. */
export interface SeatsControls {
  trip(): Trip;
  loading(): boolean;
  errorMessage(): string;
  seats(): LayoutSeat[];
  selectedSeats(): LayoutSeat[];
  totalPrice(): number;
  maxSeats: number;
  isGuest(): boolean;
  boardingPoints(): StopPoint[];
  droppingPoints(): StopPoint[];
  boarding(): StopPoint | undefined;
  dropping(): StopPoint | undefined;
  setSelected(seatIds: string[]): void;
  setBoarding(id: string): void;
  setDropping(id: string): void;
  /** Saves the choices and moves on to passenger details. */
  continue(): void;
  /** Closes the seat map, back to the list of buses. */
  close(): void;
}

const CONTINUE_ACTIONS = [
  { label: 'Continue', primary: true },
  { label: 'Change seat', primary: false },
];

/** How many seats or stops to offer as quick replies. */
const MAX_CHIPS = 3;

function fare(amount: number): string {
  return `KES ${amount.toLocaleString('en-US')}`;
}

function isFree(seat: LayoutSeat): boolean {
  return seat.status !== 'taken' && seat.price !== null;
}

function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

/** The seat labels named in the text, whether or not the bus has them:
 * "seats five and 12" gives ["5", "12"], "seat 3A" gives ["3A"]. */
export function findSeatNames(said: string, seats: LayoutSeat[]): string[] {
  // "Two seats" is how many, not seat number 2.
  const text = said.replace(/\b(\d+|[a-z]+)\s+seats\b/gi, (match, word: string) => (findNumbers(word).length ? 'seats' : match));
  const known = new Map(seats.map((seat) => [seat.name.toLowerCase(), seat.name]));
  const names: string[] = [];
  const add = (name: string) => {
    const label = known.get(name.toLowerCase()) ?? name.toUpperCase();
    if (!names.includes(label)) {
      names.push(label);
    }
  };

  // Labels with a letter, such as 3A or B12, are taken as they are written.
  const lettered = text.match(/\b(?:[a-z]\d{1,2}|\d{1,2}[a-z])\b/gi) ?? [];
  lettered.filter((label) => known.has(label.toLowerCase())).forEach(add);
  if (names.length > 0) {
    return names;
  }
  findNumbers(text).forEach((number) => add(String(number)));
  return names;
}

/** The seat map as rows of text for the AI model, front row first: seats
 * left to right, "_" for the aisle, and an "x" after a seat that is taken.
 * So "1 2 _ 3x 4" is a row where 1 and 4 are window seats and 3 is taken. */
export function seatRows(seats: LayoutSeat[]): string[] {
  if (seats.length === 0) {
    return [];
  }
  // The booking API draws most buses lying on their side, front on the
  // left. Whichever way the bus is longer is the way its rows run.
  const span = (from: (seat: LayoutSeat) => number, size: (seat: LayoutSeat) => number) =>
    Math.max(...seats.map((seat) => from(seat) + size(seat))) - Math.min(...seats.map(from));
  const sideways = span((seat) => seat.left, (seat) => seat.width) > span((seat) => seat.top, (seat) => seat.height);
  const along = (seat: LayoutSeat) => (sideways ? seat.left : seat.top);
  const across = (seat: LayoutSeat) => (sideways ? seat.top : seat.left);
  const depth = (seat: LayoutSeat) => (sideways ? seat.width : seat.height);
  const breadth = (seat: LayoutSeat) => (sideways ? seat.height : seat.width);

  const rows: LayoutSeat[][] = [];
  for (const seat of [...seats].sort((a, b) => along(a) - along(b))) {
    const row = rows.at(-1);
    if (row && along(seat) - along(row[0]) < depth(row[0]) / 2) {
      row.push(seat);
    } else {
      rows.push([seat]);
    }
  }
  return rows.map((row) => {
    const ordered = row.sort((a, b) => across(a) - across(b));
    return ordered
      .map((seat, index) => {
        const previous = ordered[index - 1];
        // Neighbours sit up to about a seat apart (the back bench spreads
        // five across). An aisle is a clearly wider gap than that.
        const aisle = previous && across(seat) - (across(previous) + breadth(previous)) >= breadth(seat) * 1.5;
        return `${aisle ? '_ ' : ''}${seat.name}${isFree(seat) ? '' : 'x'}`;
      })
      .join(' ');
  });
}

/** Which seats are in each class, for the AI model, with runs of numbered
 * seats shortened: { VIP: "1-8", Normal: "9-45" }. */
export function seatClasses(seats: LayoutSeat[]): Record<string, string> {
  const byClass = new Map<string, string[]>();
  for (const seat of seats) {
    byClass.set(seat.typeLabel, [...(byClass.get(seat.typeLabel) ?? []), seat.name]);
  }
  const shorten = (names: string[]) => {
    if (!names.every((name) => /^\d+$/.test(name))) {
      return names.join(', ');
    }
    const numbers = names.map(Number).sort((a, b) => a - b);
    const runs: string[] = [];
    for (let i = 0; i < numbers.length; i++) {
      const start = numbers[i];
      while (numbers[i + 1] === numbers[i] + 1) {
        i++;
      }
      runs.push(start === numbers[i] ? `${start}` : `${start}-${numbers[i]}`);
    }
    return runs.join(', ');
  };
  return Object.fromEntries([...byClass].map(([label, names]) => [label, shorten(names)]));
}

/** Picking seats and stops in the seat panel. */
export class SeatsVoiceStep implements VoiceStep {
  constructor(private panel: SeatsControls) {}

  /** Lets the AI model answer what the rules below do not understand, such
   * as "two seats together near the front". */
  readonly model: VoiceStepModel = {
    name: 'seats',
    context: () => {
      const trip = this.panel.trip();
      const fares = new Map<string, number>();
      for (const seat of this.panel.seats()) {
        if (seat.price !== null) {
          fares.set(seat.typeLabel, seat.price);
        }
      }
      const stop = (point: StopPoint) => (point.time ? `${point.name} (${point.time})` : point.name);
      return {
        bus: `${trip.operator}, ${trip.departureTime}`,
        seat_rows_front_to_back: seatRows(this.panel.seats()),
        fares_kes: Object.fromEntries(fares),
        seats_in_each_class: seatClasses(this.panel.seats()),
        most_seats_allowed: this.limit(),
        booking_as_guest: this.panel.isGuest(),
        selected_seats: this.panel.selectedSeats().map((seat) => seat.name),
        total_kes: this.panel.totalPrice(),
        boarding_points: this.panel.boardingPoints().map(stop),
        drop_off_points: this.panel.droppingPoints().map(stop),
        boarding: this.panel.boarding()?.name ?? null,
        drop_off: this.panel.dropping()?.name ?? null,
      };
    },
    runTool: async (name, args) => this.runTool(name, args),
    prompts: () => {
      const { chips, actions, confirm } = this.next();
      return { chips, actions, confirm };
    },
  };

  private runTool(name: string, args: Record<string, unknown>): VoiceToolResult {
    const word = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    switch (name) {
      case 'select_seats': {
        const names = Array.isArray(args['seats']) ? args['seats'].map((seat) => String(seat).trim()).filter(Boolean) : [];
        const seats = this.panel.seats();
        const problems: string[] = [];
        const wanted: LayoutSeat[] = [];
        for (const name of names) {
          const seat = seats.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
          if (!seat) {
            problems.push(`There is no seat ${name} on this bus.`);
          } else if (!isFree(seat)) {
            problems.push(`Seat ${name} is taken.`);
          } else if (!wanted.includes(seat)) {
            wanted.push(seat);
          }
        }
        if (wanted.length > this.limit()) {
          problems.push(
            this.panel.isGuest()
              ? 'A guest can book one seat. Logging in allows more.'
              : `At most ${this.limit()} seats can be booked at a time.`,
          );
        }
        const picked = wanted.slice(0, this.limit());
        this.panel.setSelected(picked.map((seat) => seat.id));
        return {
          selected_seats: picked.map((seat) => ({ seat: seat.name, class: seat.typeLabel, fare_kes: seat.price })),
          total_kes: this.panel.totalPrice(),
          still_needed: this.stillNeeded(),
          ...(problems.length ? { problems } : {}),
        };
      }
      case 'set_stops': {
        const problems: string[] = [];
        const boarding = word(args['boarding']);
        const dropOff = word(args['drop_off']);
        if (boarding) {
          const point = findByName(boarding, this.panel.boardingPoints());
          point ? this.panel.setBoarding(point.id) : problems.push(`${boarding} is not one of the boarding points.`);
        }
        if (dropOff) {
          const point = findByName(dropOff, this.panel.droppingPoints());
          point ? this.panel.setDropping(point.id) : problems.push(`${dropOff} is not one of the drop-off points.`);
        }
        return {
          boarding: this.panel.boarding()?.name ?? null,
          drop_off: this.panel.dropping()?.name ?? null,
          still_needed: this.stillNeeded(),
          ...(problems.length ? { problems } : {}),
        };
      }
      case 'continue_to_details':
        if (this.asking() !== 'confirm') {
          return { ok: false, still_needed: this.stillNeeded() };
        }
        this.panel.continue();
        return { ok: true, leaving: true };
      case 'back_to_buses':
        this.panel.close();
        return { ok: true, leaving: true };
      default:
        return { error: 'Unknown tool' };
    }
  }

  /** A guest books one seat at a time. */
  private limit(): number {
    return this.panel.isGuest() ? 1 : this.panel.maxSeats;
  }

  private stillNeeded(): string[] {
    const needed: string[] = [];
    if (this.panel.selectedSeats().length === 0) {
      needed.push('a seat');
    }
    if (!this.panel.boarding()) {
      needed.push('boarding point');
    }
    if (!this.panel.dropping()) {
      needed.push('drop-off point');
    }
    return needed;
  }

  unsure(): VoiceReply {
    const next = this.next();
    const what = this.asking() === 'boarding' || this.asking() === 'dropping' ? ' that stop' : ' that';
    return { ...next, text: `Sorry, I didn't catch${what}. ${next.text}` };
  }

  ready(): boolean {
    return !this.panel.loading();
  }

  reset(): void {
    // Nothing is half-agreed here: every choice is already on the seat map.
  }

  intro(): VoiceReply {
    const error = this.panel.errorMessage();
    if (error) {
      return { text: `${error} Say back to pick another bus.`, chips: ['Back'] };
    }
    const free = this.panel.seats().filter(isFree);
    if (free.length === 0) {
      return { text: 'This bus is full. Say back to pick another bus.', chips: ['Back'] };
    }
    if (this.panel.selectedSeats().length > 0) {
      return this.next();
    }
    const trip = this.panel.trip();
    const lowest = Math.min(...free.map((seat) => seat.price ?? 0));
    const count = free.length === 1 ? '1 seat is free' : `${free.length} seats are free`;
    return {
      text: `${trip.operator}, ${trip.departureTime}. ${count}, from ${fare(lowest)}. Which seat would you like?`,
      chips: this.seatChips(),
    };
  }

  async answer(text: string): Promise<VoiceReply | null | undefined> {
    if (/^\W*(back|go back|another bus|other bus(es)?|change bus)\W*$/i.test(text)) {
      this.panel.close();
      return null;
    }
    if (this.panel.errorMessage()) {
      return this.intro();
    }

    const asking = this.asking();
    // While a stop is being asked for, a bare number means a stop, so the
    // word "seat" is needed to change seats then.
    if (asking === 'seats' || asking === 'confirm' || /\bseats?\b/i.test(text)) {
      const reply = this.readSeats(text);
      if (reply) {
        return reply;
      }
    }

    if (asking === 'boarding' || asking === 'dropping') {
      const points = asking === 'boarding' ? this.panel.boardingPoints() : this.panel.droppingPoints();
      const number = findNumbers(text)[0];
      const point = findByName(text, points) ?? (number ? points[number - 1] : undefined);
      if (point) {
        if (asking === 'boarding') {
          this.panel.setBoarding(point.id);
        } else {
          this.panel.setDropping(point.id);
        }
        return this.next();
      }
      return undefined;
    }

    if (asking === 'confirm') {
      if (/\b(change|different|another|other)\b/i.test(text) || saysNo(text)) {
        this.panel.setSelected([]);
        return { text: 'I have cleared your seats. Which seat would you like?', chips: this.seatChips() };
      }
      if (saysYes(text) || /\b(continue|next|proceed|done)\b/i.test(text)) {
        this.panel.continue();
        return null;
      }
    }

    return undefined;
  }

  /** What is still missing, in the order it is asked for. */
  private asking(): 'seats' | 'boarding' | 'dropping' | 'confirm' {
    if (this.panel.selectedSeats().length === 0) {
      return 'seats';
    }
    if (!this.panel.boarding()) {
      return 'boarding';
    }
    return this.panel.dropping() ? 'confirm' : 'dropping';
  }

  /** Adds or removes the seats named in the text. Null when none were. */
  private readSeats(text: string): VoiceReply | null {
    const seats = this.panel.seats();
    const names = findSeatNames(text, seats);
    const anySeat = /\bany\b/i.test(text);
    if (names.length === 0 && !anySeat) {
      return null;
    }

    const selected = this.panel.selectedSeats();
    if (/\b(remove|drop|cancel|unselect|deselect|not)\b/i.test(text)) {
      const kept = selected.filter((seat) => !names.includes(seat.name));
      this.panel.setSelected(kept.map((seat) => seat.id));
      return kept.length === selected.length
        ? { text: `Seat ${list(names)} was not selected. ${this.next().text}`, chips: this.next().chips }
        : this.next(`Removed seat ${list(names.filter((name) => selected.some((seat) => seat.name === name)))}. `);
    }

    const problems: string[] = [];
    const wanted: LayoutSeat[] = [];
    for (const name of names) {
      const seat = seats.find((entry) => entry.name === name);
      if (!seat) {
        problems.push(`There is no seat ${name} on this bus.`);
      } else if (!isFree(seat)) {
        problems.push(`Seat ${name} is taken.`);
      } else {
        wanted.push(seat);
      }
    }
    if (anySeat && names.length === 0) {
      const free = seats.find((seat) => isFree(seat) && !selected.includes(seat));
      if (free) {
        wanted.push(free);
      }
    }
    if (wanted.length === 0) {
      return { text: `${problems.join(' ')} Which seat would you like?`.trim(), chips: this.seatChips() };
    }

    // A guest books one seat, so a new pick replaces the old one.
    const limit = this.limit();
    let picked = this.panel.isGuest() ? wanted : [...selected, ...wanted.filter((seat) => !selected.includes(seat))];
    if (picked.length > limit) {
      picked = picked.slice(0, limit);
      problems.push(
        this.panel.isGuest()
          ? 'As a guest you can book one seat. Log in to book more.'
          : `You can book up to ${limit} seats at a time.`,
      );
    }
    this.panel.setSelected(picked.map((seat) => seat.id));
    return this.next(problems.length ? `${problems.join(' ')} ` : '');
  }

  /** Asks for the next missing piece, or to continue once nothing is. */
  private next(lead = ''): VoiceReply {
    const selected = this.panel.selectedSeats();
    if (selected.length === 0) {
      return { text: `${lead}Which seat would you like?`, chips: this.seatChips() };
    }
    const names = list(selected.map((seat) => seat.name));
    const seatsSaid = `${selected.length > 1 ? 'Seats' : 'Seat'} ${names}`;
    const total = fare(this.panel.totalPrice());

    if (!this.panel.boarding()) {
      return {
        text: `${lead}${seatsSaid}, ${total}. Where will you board?`,
        chips: this.panel
          .boardingPoints()
          .slice(0, MAX_CHIPS)
          .map((point) => point.name),
      };
    }
    if (!this.panel.dropping()) {
      return {
        text: `${lead}${seatsSaid}, ${total}. Where will you get off?`,
        chips: this.panel
          .droppingPoints()
          .slice(0, MAX_CHIPS)
          .map((point) => point.name),
      };
    }
    return {
      text: `${lead}${seatsSaid}, ${this.panel.boarding()?.name} to ${this.panel.dropping()?.name}, ${total} in total. Continue to passenger details?`,
      actions: CONTINUE_ACTIONS,
      confirm: true,
    };
  }

  private seatChips(): string[] {
    const selected = this.panel.selectedSeats();
    return this.panel
      .seats()
      .filter((seat) => isFree(seat) && !selected.includes(seat))
      .slice(0, MAX_CHIPS)
      .map((seat) => `Seat ${seat.name}`);
  }
}
