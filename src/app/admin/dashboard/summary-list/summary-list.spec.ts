import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WeekSummary } from '../../../models/admin-dashboard.model';
import { SummaryList } from './summary-list';

const UNTRACKED: WeekSummary = {
  ticketsSold: 0,
  tripsCompleted: 2,
  seatsOpenToday: 41,
  refundsIssued: null,
  averageRating: null,
};

function setup(summary: WeekSummary) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SummaryList);
  fixture.componentRef.setInput('state', { status: 'ready', data: summary });
  fixture.detectChanges();
  return fixture;
}

describe('SummaryList', () => {
  it('shows zero values normally and names the seats row for upcoming trips', () => {
    const { componentInstance } = setup(UNTRACKED);
    expect(componentInstance.rows()).toEqual([
      { label: 'Tickets sold', value: '0' },
      { label: 'Trips completed', value: '2' },
      { label: 'Seats open on upcoming trips', value: '41' },
    ]);
  });

  it('collapses refunds and ratings into one "not tracked yet" line', () => {
    const fixture = setup(UNTRACKED);
    const footer: HTMLElement = fixture.nativeElement.querySelector('.summary-footer');

    expect(footer.textContent).toContain('Refunds and ratings are not tracked yet');
    expect(footer.textContent).toContain('Set up');
    expect(fixture.nativeElement.textContent).not.toContain('Not tracked yet');
  });

  it('gives a tracked metric its own row and only mentions the untracked one', () => {
    const fixture = setup({ ...UNTRACKED, refundsIssued: 3 });

    expect(fixture.componentInstance.rows().map((row) => row.label)).toContain('Refunds issued');
    expect(fixture.componentInstance.untrackedText()).toBe('Ratings are not tracked yet');
  });

  it('drops the line when everything is tracked', () => {
    const fixture = setup({ ...UNTRACKED, refundsIssued: 0, averageRating: 4.5 });

    expect(fixture.componentInstance.untrackedText()).toBe('');
    expect(fixture.nativeElement.querySelector('.summary-footer')).toBeNull();
  });
});
