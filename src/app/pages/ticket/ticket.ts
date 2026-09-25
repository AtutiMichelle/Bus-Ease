import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { BookingDraftService } from '../../services/booking-draft.service';
import { TravlerApiService } from '../../travler/travler-api.service';

@Component({
  imports: [RouterLink, DecimalPipe],
  selector: 'app-ticket',
  styleUrl: './ticket.css',
  templateUrl: './ticket.html',
})
export class Ticket {
  readonly steps = ['Search', 'Seats', 'Details', 'Payment', 'Confirmation'];
  readonly currentStepIndex = 4;

  private route = inject(ActivatedRoute);
  private bookingDraft = inject(BookingDraftService);
  private travler = inject(TravlerApiService);

  ticketNumber = signal('');
  reference = signal('');
  printing = signal(false);
  /** The printable ticket couldn't be opened, so the on-screen details stand in for it. */
  printFallback = signal(false);

  /** The booking this ticket belongs to, when this tab still has it. */
  booking = computed(() => {
    const draft = this.bookingDraft.current();
    if (!draft?.ticketNumber && !draft?.hold) {
      return undefined;
    }
    const matchesTicket = !!this.ticketNumber() && draft.ticketNumber === this.ticketNumber();
    const matchesReference = !!this.reference() && draft.hold?.reference === this.reference();
    return matchesTicket || matchesReference ? draft : undefined;
  });

  seatList = computed(() => (this.booking()?.seats ?? []).map((s) => s.name).join(', '));
  totalPaid = computed(() => this.booking()?.hold?.totalAmount ?? 0);

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.ticketNumber.set(params.get('ticket') ?? '');
    this.reference.set(params.get('reference') ?? '');
  }

  /** Opens the API's printable ticket in a new tab. The tab is opened
   * straight away, while the click still counts as a user action, since
   * browsers block pop-ups opened after an await. If the URL can't be
   * fetched or reached, the tab closes and the details stay on screen. */
  async print(): Promise<void> {
    if (this.printing()) {
      return;
    }
    const ticketNumber = this.ticketNumber();
    if (!ticketNumber) {
      this.printFallback.set(true);
      return;
    }
    const tab = window.open('', '_blank');
    this.printing.set(true);
    this.printFallback.set(false);
    try {
      const { url } = await this.travler.getPrintableTicket(ticketNumber);
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('No printable URL');
      }
      // An opaque no-cors request can't read the file, but it does fail on
      // DNS or network errors, which is the case worth catching here.
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      if (!tab) {
        throw new Error('Pop-up blocked');
      }
      tab.opener = null;
      tab.location.href = url;
    } catch {
      tab?.close();
      this.printFallback.set(true);
    } finally {
      this.printing.set(false);
    }
  }

  printPage(): void {
    window.print();
  }
}
