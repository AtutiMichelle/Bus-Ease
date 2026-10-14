import { normalizeKenyanPhone } from '../../utils/validation';
import { localPhone, spellOut } from '../voice-parse';
import { VoiceReply, VoiceStep } from '../voice-steps.service';

export type PaymentPhase = 'ready' | 'starting' | 'awaiting' | 'rejected' | 'timeout' | 'error' | 'expired';

/** What the payment page lets the assistant read. */
export interface PaymentControls {
  /** False when there is no unpaid booking on this page to pay for. */
  payable(): boolean;
  phase(): PaymentPhase;
  /** The M-Pesa number as typed in the form. */
  phone(): string;
  totalPrice(): number;
  errorMessage(): string;
}

function fare(amount: number): string {
  return `KES ${amount.toLocaleString('en-US')}`;
}

/** Paying with M-Pesa. The assistant never sends a payment: it hands the
 * page over to the user, and only says what is happening as the payment
 * moves along. */
export class PaymentVoiceStep implements VoiceStep {
  constructor(private page: PaymentControls) {}

  ready(): boolean {
    return true;
  }

  stage(): string {
    return this.page.phase();
  }

  reset(): void {}

  intro(): VoiceReply | null {
    if (!this.page.payable()) {
      return { text: 'There is no booking waiting for payment on this page.', listen: false };
    }
    const amount = fare(this.page.totalPrice());

    switch (this.page.phase()) {
      case 'starting':
        return null;
      case 'awaiting':
        return {
          ...this.withNumber((number) => `An M-Pesa request has been sent to ${number}. Enter your PIN on your phone to pay ${amount}.`),
          listen: false,
        };
      case 'rejected':
      case 'error':
        return {
          text: `${this.page.errorMessage() || 'The payment did not go through.'} Tap Try again on the page to send a new request.`,
          listen: false,
        };
      case 'timeout':
        return {
          text: 'I have not seen the payment yet. If you entered your PIN, tap Check again on the page before paying a second time.',
          listen: false,
        };
      case 'expired':
        return {
          text: 'The hold on your seats has run out. Tap Reselect seats on the page to choose them again.',
          listen: false,
        };
      case 'ready':
        return {
          text: `Over to you for the payment. The total is ${amount}. Check your M-Pesa number on the page, then tap Pay to send the request.`,
          listen: false,
          handover: true,
        };
    }
  }

  async answer(): Promise<VoiceReply | null> {
    return this.unsure();
  }

  unsure(): VoiceReply {
    const phase = this.page.phase();
    if (!this.page.payable() || phase === 'starting' || phase === 'awaiting') {
      return this.intro() ?? { text: 'The payment request is on its way to your phone.', listen: false };
    }
    return { text: "I can't make the payment for you. Please use the buttons on the page.", listen: false, handover: true };
  }

  /** A sentence with the M-Pesa number in it, written the usual way and
   * read aloud one digit at a time. */
  private withNumber(sentence: (number: string) => string): VoiceReply {
    const phone = normalizeKenyanPhone(this.page.phone());
    const written = phone ? localPhone(phone) : this.page.phone();
    return { text: sentence(written), say: sentence(spellOut(written)) };
  }
}
