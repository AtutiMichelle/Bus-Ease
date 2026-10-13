import { TripPassenger } from '../../models/booking.model';
import { isValidEmail, isValidIdNumber, normalizeKenyanPhone } from '../../utils/validation';
import { findNumbers, localPhone, saysNo, saysYes, spellOut, spokenCode, spokenDigits, spokenEmail, spokenName } from '../voice-parse';
import { VoiceReply, VoiceStep } from '../voice-steps.service';

/** What the passenger details page lets the assistant read and do. */
export interface DetailsControls {
  passengers(): TripPassenger[];
  setPassenger(index: number, field: 'fullName' | 'idNumber', value: string): void;
  email(): string;
  setEmail(value: string): void;
  phone(): string;
  setPhone(value: string): void;
  totalPrice(): number;
  holdMinutes: number;
  /** Reserves the seats and moves on to payment. Resolves once it has
   * either moved on or failed. */
  reserve(): Promise<void>;
  errorMessage(): string;
}

/** One thing the assistant asks for. */
type Field = { kind: 'name' | 'id'; passenger: number } | { kind: 'email' | 'phone' };

const RESERVE_ACTIONS = [
  { label: 'Reserve seats', primary: true },
  { label: 'Edit', primary: false },
];

function fare(amount: number): string {
  return `KES ${amount.toLocaleString('en-US')}`;
}

/** Filling in passenger and contact details. Everything said here stays in
 * the browser: it is read by fixed rules, never sent to the AI model. */
export class DetailsVoiceStep implements VoiceStep {
  /** A detail the user asked to give again, even though it is filled in. */
  private editing?: Field;
  /** True after "Edit", while waiting to hear which detail. */
  private choosingEdit = false;
  /** The start of an ID or phone number that was said in pieces. */
  private partial = '';
  /** A number or address just taken down, to be read back so a mishearing
   * is caught: what to show, and how to say it. */
  private heard?: { text: string; say: string };

  constructor(private page: DetailsControls) {}

  ready(): boolean {
    return true;
  }

  reset(): void {
    this.editing = undefined;
    this.choosingEdit = false;
    this.partial = '';
  }

  /** Numbers and email addresses are said in pieces, with pauses. */
  patient(): boolean {
    const kind = this.choosingEdit ? undefined : (this.editing ?? this.missing())?.kind;
    return kind === 'id' || kind === 'phone' || kind === 'email';
  }

  unsure(): VoiceReply {
    return { ...this.question(), text: `Sorry, I didn't catch that. ${this.question().text}` };
  }

  intro(): VoiceReply {
    this.reset();
    const field = this.missing();
    if (!field) {
      return this.question();
    }
    return { ...this.question(), text: `I need a few details for the ticket. ${this.question().text}` };
  }

  async answer(text: string): Promise<VoiceReply | null> {
    if (this.choosingEdit) {
      const field = this.namedField(text);
      if (!field) {
        return { text: 'Which detail? Say name, ID, email or phone.', chips: ['Name', 'ID', 'Email', 'Phone'] };
      }
      this.choosingEdit = false;
      this.editing = field;
      return this.question();
    }

    const field = this.editing ?? this.missing();
    if (!field) {
      const change = /\b(change|edit|wrong|correct|fix)\b/i.test(text) ? this.namedField(text) : undefined;
      if (change) {
        this.editing = change;
        return this.question();
      }
      if (saysNo(text)) {
        this.choosingEdit = true;
        return { text: 'What would you like to change? Say name, ID, email or phone.', chips: ['Name', 'ID', 'Email', 'Phone'] };
      }
      if (saysYes(text) || /\b(reserve|book|continue|pay|proceed)\b/i.test(text)) {
        await this.page.reserve();
        const error = this.page.errorMessage();
        return error ? { text: `${error} Shall I try again?`, actions: RESERVE_ACTIONS, confirm: true } : null;
      }
      return this.unsure();
    }

    const problem = this.fill(field, text);
    if (problem) {
      return problem;
    }
    this.editing = undefined;
    this.partial = '';
    const heard = this.heard;
    this.heard = undefined;
    const question = this.question();
    return heard ? { ...question, text: `${heard.text}. ${question.text}`, say: `${heard.say}. ${question.text}` } : question;
  }

  /** Joins a number said in pieces. The new piece stands alone when it is
   * already a whole number, so saying it all again also works. */
  private pieced(piece: string, whole: (value: string) => boolean): string {
    return whole(piece) || !this.partial ? piece : this.partial + piece;
  }

  /** Keeps the start of a number that is too short and asks for the rest. */
  private askForRest(soFar: string, problem: string): VoiceReply {
    const type = ' You can also type it in the box below.';
    if (!soFar) {
      this.partial = '';
      return { text: problem + type };
    }
    this.partial = soFar;
    const sentence = (said: string) => `I have ${said} so far. Say the rest, or say start over.`;
    return { text: sentence(soFar), say: sentence(spellOut(soFar)), chips: ['Start over'] };
  }

  /** Puts the answer into the form. Returns what to say when it could not
   * be used, or null when it was accepted. */
  private fill(field: Field, text: string): VoiceReply | null {
    const type = ' You can also type it in the box below.';
    const startOver = /^\W*(start over|start again|restart|clear)\W*$/i.test(text);
    if (startOver) {
      this.partial = '';
      return this.question();
    }

    switch (field.kind) {
      case 'name': {
        const name = spokenName(text);
        if (name.length < 2 || /\d/.test(name)) {
          return { text: `Sorry, I didn't catch the name. Please say the full name again.${type}` };
        }
        this.page.setPassenger(field.passenger, 'fullName', name);
        return null;
      }
      case 'id': {
        const id = this.pieced(spokenCode(text), isValidIdNumber);
        if (id.length > 20 || !/^[A-Z0-9]*$/.test(id)) {
          this.partial = '';
          return { text: `That does not look like an ID or passport number. Please say it again.${type}` };
        }
        if (!isValidIdNumber(id)) {
          return this.askForRest(id, `I did not catch an ID or passport number. It is 5 to 20 letters or numbers.`);
        }
        this.page.setPassenger(field.passenger, 'idNumber', id);
        this.heard = { text: `ID ${id}`, say: `I D ${spellOut(id)}` };
        return null;
      }
      case 'email': {
        const email = spokenEmail(text);
        if (!isValidEmail(email)) {
          return { text: `That does not look like an email address. Say it like: name at gmail dot com.${type}` };
        }
        this.page.setEmail(email);
        this.heard = { text: email, say: email.replace('@', ' at ').replace(/\./g, ' dot ') };
        return null;
      }
      case 'phone': {
        const digits = this.pieced(spokenDigits(text), (value) => !!normalizeKenyanPhone(value));
        const phone = normalizeKenyanPhone(digits);
        if (!phone) {
          if (digits.length >= 10) {
            this.partial = '';
            return { text: `That does not look like a Kenyan mobile number. Say it like: 0712 345 678.${type}` };
          }
          return this.askForRest(digits, 'I did not catch a mobile number. Say it like: 0712 345 678.');
        }
        this.page.setPhone(localPhone(phone));
        this.heard = { text: localPhone(phone), say: spellOut(localPhone(phone)) };
        return null;
      }
    }
  }

  /** The first detail that is still empty or wrong. */
  private missing(): Field | undefined {
    const passengers = this.page.passengers();
    for (let index = 0; index < passengers.length; index++) {
      if (passengers[index].fullName.trim().length < 2) {
        return { kind: 'name', passenger: index };
      }
      if (!isValidIdNumber(passengers[index].idNumber)) {
        return { kind: 'id', passenger: index };
      }
    }
    if (!isValidEmail(this.page.email())) {
      return { kind: 'email' };
    }
    return normalizeKenyanPhone(this.page.phone()) ? undefined : { kind: 'phone' };
  }

  /** The detail the text names, such as "the ID for seat 5". */
  private namedField(text: string): Field | undefined {
    const lower = text.toLowerCase();
    if (/\be-?mail\b/.test(lower)) {
      return { kind: 'email' };
    }
    if (/\b(phone|mobile|number)\b/.test(lower) && !/\b(id|passport)\b/.test(lower)) {
      return { kind: 'phone' };
    }
    const kind = /\b(id|i\.d|passport)\b/.test(lower) ? 'id' : /\bname\b/.test(lower) ? 'name' : undefined;
    if (!kind) {
      return undefined;
    }
    const passengers = this.page.passengers();
    const seat = findNumbers(text).map(String)[0];
    const index = passengers.findIndex((passenger) => passenger.seatName === seat);
    return { kind, passenger: Math.max(index, 0) };
  }

  /** Asks for the next detail, or to reserve once nothing is missing. */
  private question(): VoiceReply {
    const field = this.editing ?? this.missing();
    const passengers = this.page.passengers();
    if (!field) {
      const who =
        passengers.length === 1
          ? `${passengers[0].fullName}, seat ${passengers[0].seatName}`
          : `${passengers.length} passengers, seats ${passengers.map((passenger) => passenger.seatName).join(', ')}`;
      return {
        text: `All set: ${who}, ${fare(this.page.totalPrice())} in total. Reserve for ${this.page.holdMinutes} minutes and go to payment?`,
        actions: RESERVE_ACTIONS,
        confirm: true,
      };
    }

    const seat = 'passenger' in field && passengers.length > 1 ? ` for seat ${passengers[field.passenger].seatName}` : '';
    switch (field.kind) {
      case 'name':
        return { text: `What is the passenger's full name${seat}?` };
      case 'id':
        return { text: `What is the ID or passport number${seat}?` };
      case 'email':
        return { text: 'Which email address should the ticket go to?' };
      case 'phone':
        return { text: 'What is your mobile number?' };
    }
  }
}
