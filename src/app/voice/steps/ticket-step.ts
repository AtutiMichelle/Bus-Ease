import { spellOut } from '../voice-parse';
import { VoiceReply, VoiceStep } from '../voice-steps.service';

/** What the ticket page lets the assistant read. */
export interface TicketControls {
  ticketNumber(): string;
  reference(): string;
}

/** The end of the booking: says the ticket is ready. */
export class TicketVoiceStep implements VoiceStep {
  constructor(private page: TicketControls) {}

  ready(): boolean {
    return true;
  }

  reset(): void {
    // Nothing to forget.
  }

  intro(): VoiceReply {
    const code = this.page.ticketNumber() || this.page.reference();
    const label = this.page.ticketNumber() ? 'ticket number' : 'booking reference';
    const sentence = (said: string) =>
      code
        ? `Your booking is confirmed. Your ${label} is ${said}. The ticket is on this page.`
        : 'Your booking is confirmed. The ticket is on this page.';
    return { text: sentence(code), say: sentence(spellOut(code)), listen: false };
  }

  async answer(): Promise<VoiceReply> {
    return this.unsure();
  }

  unsure(): VoiceReply {
    return { text: 'Your ticket is on this page. You can print it from here. Safe travels!', listen: false };
  }
}
