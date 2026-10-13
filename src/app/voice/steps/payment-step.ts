import { normalizeKenyanPhone } from '../../utils/validation';
import { localPhone, saysNo, saysYes, spellOut, spokenDigits } from '../voice-parse';
import { VoiceReply, VoiceStep } from '../voice-steps.service';

export type PaymentPhase = 'ready' | 'starting' | 'awaiting' | 'rejected' | 'timeout' | 'error' | 'expired';

/** What the payment page lets the assistant read and do. */
export interface PaymentControls {
  /** False when there is no unpaid booking on this page to pay for. */
  payable(): boolean;
  phase(): PaymentPhase;
  /** The M-Pesa number as typed in the form. */
  phone(): string;
  setPhone(value: string): void;
  totalPrice(): number;
  remainingSeconds(): number;
  errorMessage(): string;
  /** Sends the M-Pesa prompt. */
  pay(): void;
  /** Looks once more for a payment that was slow to arrive. */
  checkAgain(): void;
  backToSeats(): void;
}

const PAY_ACTIONS = [
  { label: 'Pay now', primary: true },
  { label: 'Change number', primary: false },
];
const RETRY_ACTIONS = [
  { label: 'Try again', primary: true },
  { label: 'Change number', primary: false },
];
const TIMEOUT_ACTIONS = [
  { label: 'Check again', primary: true },
  { label: 'Pay again', primary: false },
];
const EXPIRED_ACTIONS = [{ label: 'Choose seats', primary: true }];

function fare(amount: number): string {
  return `KES ${amount.toLocaleString('en-US')}`;
}

/** Paying with M-Pesa. The prompt is only ever sent after the user agrees
 * to the amount and the number, and what is said here is read by fixed
 * rules, never sent to the AI model. */
export class PaymentVoiceStep implements VoiceStep {
  /** True while waiting to hear a new M-Pesa number. */
  private askingNumber = false;
  /** True while looking again for a payment already asked for. */
  private checking = false;

  constructor(private page: PaymentControls) {}

  ready(): boolean {
    return true;
  }

  stage(): string {
    return this.page.phase();
  }

  /** A phone number is said in pieces, with pauses. */
  patient(): boolean {
    return this.askingNumber;
  }

  unsure(): VoiceReply {
    const again = this.intro();
    return { ...again, text: `Sorry, I didn't catch that. ${again?.text ?? ''}`.trim(), say: undefined };
  }

  reset(): void {
    this.askingNumber = false;
    this.checking = false;
  }

  intro(): VoiceReply | null {
    if (!this.page.payable()) {
      return { text: 'There is no booking waiting for payment on this page.', listen: false };
    }
    const amount = fare(this.page.totalPrice());

    switch (this.page.phase()) {
      case 'starting':
        return null;
      case 'awaiting':
        if (this.checking) {
          return { text: 'Checking for your payment.', listen: false };
        }
        return {
          ...this.withNumber((number) => `I have sent an M-Pesa request to ${number}. Enter your PIN on your phone to pay ${amount}.`),
          listen: false,
        };
      case 'rejected':
      case 'error':
        return {
          text: `${this.page.errorMessage() || 'The payment did not go through.'} Say pay to try again.`,
          actions: RETRY_ACTIONS,
          confirm: true,
        };
      case 'timeout':
        return {
          text: 'I have not seen the payment yet. Shall I check again? To send a new request instead, say pay.',
          actions: TIMEOUT_ACTIONS,
          confirm: true,
        };
      case 'expired':
        return {
          text: 'The hold on your seats has run out, so they need to be chosen again. Go back to the seats?',
          actions: EXPIRED_ACTIONS,
          confirm: true,
        };
      case 'ready':
        return this.askToPay();
    }
  }

  async answer(text: string): Promise<VoiceReply | null> {
    if (!this.page.payable()) {
      return this.intro();
    }
    const phase = this.page.phase();

    if (phase === 'starting' || phase === 'awaiting') {
      return { text: 'I am waiting for the payment. Enter your M-Pesa PIN on your phone.', listen: false };
    }
    if (phase === 'expired') {
      if (saysYes(text) || /\b(seats?|back|choose)\b/i.test(text)) {
        this.page.backToSeats();
        return null;
      }
      return this.intro();
    }

    // A number said at any point becomes the M-Pesa number, and is read
    // back before anything is sent.
    const digits = spokenDigits(text);
    const phone = digits.length >= 9 ? normalizeKenyanPhone(digits) : null;
    if (phone) {
      this.askingNumber = false;
      this.page.setPhone(localPhone(phone));
      return this.askToPay();
    }
    if (this.askingNumber || digits.length >= 6) {
      return { text: 'That does not look like a Safaricom number. Say it like: 0712 345 678, or type it in the box below.' };
    }
    if (/\b(change|different|another|other|wrong)\b/i.test(text)) {
      this.askingNumber = true;
        return { text: 'Which M-Pesa number should I use?' };
    }

    // Money only moves on a word that can mean nothing else. A plain "yes"
    // or "okay" picked up by the mic is never enough.
    const asksToPay = /\b(pay|send|try again|retry)\b/i.test(text);
    // After a wait with no answer, checking is the safe reading of "yes":
    // it can never charge twice.
    if (phase === 'timeout' && !asksToPay && (saysYes(text) || /\bcheck\b/i.test(text))) {
      this.checking = true;
      this.page.checkAgain();
      return null;
    }
    if (saysNo(text)) {
        return { text: 'Okay, nothing was sent. Say pay when you are ready.', listen: false };
    }
    if (saysYes(text) && !asksToPay) {
      return { ...this.intro(), text: 'To send the M-Pesa request, say pay, or tap the button.', say: undefined };
    }
    if (asksToPay) {
      if (!normalizeKenyanPhone(this.page.phone())) {
        this.askingNumber = true;
        return { text: 'Which M-Pesa number should I use?' };
      }
        this.checking = false;
      this.page.pay();
      return null;
    }
    return this.unsure();
  }

  private askToPay(): VoiceReply {
    const amount = fare(this.page.totalPrice());
    if (!normalizeKenyanPhone(this.page.phone())) {
      this.askingNumber = true;
      return { text: `The total is ${amount}. Which M-Pesa number should I send the payment request to?` };
    }
    const minutes = Math.max(1, Math.ceil(this.page.remainingSeconds() / 60));
    return {
      ...this.withNumber(
        (number) =>
          `Your seats are held for ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}. The total is ${amount}, on M-Pesa number ${number}. Say pay to send the request.`,
      ),
      actions: PAY_ACTIONS,
      confirm: true,
    };
  }

  /** A sentence with the M-Pesa number in it, written the usual way and
   * read aloud one digit at a time. */
  private withNumber(sentence: (number: string) => string): VoiceReply {
    const phone = normalizeKenyanPhone(this.page.phone());
    const written = phone ? localPhone(phone) : this.page.phone();
    return { text: sentence(written), say: sentence(spellOut(written)) };
  }
}
