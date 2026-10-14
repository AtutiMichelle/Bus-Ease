import { VoiceReply, VoiceStep } from '../voice-steps.service';

/** What the passenger details page lets the assistant read. */
export interface DetailsControls {
  passengerCount(): number;
}

/** Passenger and contact details. The assistant takes none of these by
 * voice: it hands the form over to the user, who fills it in and confirms
 * the booking on the page. Its panel closes once that has been said. */
export class DetailsVoiceStep implements VoiceStep {
  constructor(private page: DetailsControls) {}

  ready(): boolean {
    return true;
  }

  reset(): void {}

  intro(): VoiceReply {
    return { text: `Over to you for this part. ${this.handover()}`, listen: false, handover: true };
  }

  async answer(): Promise<VoiceReply> {
    return this.unsure();
  }

  unsure(): VoiceReply {
    return { text: `I can't take these details for you. ${this.handover()}`, listen: false, handover: true };
  }

  private handover(): string {
    const whose = this.page.passengerCount() > 1 ? "each passenger's" : "the passenger's";
    return `Please fill in ${whose} full name and ID or passport number, then your email and phone number. When you are done, tap Confirm Booking to go to payment.`;
  }
}
