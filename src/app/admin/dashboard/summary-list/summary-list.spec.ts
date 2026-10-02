import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WeekSummary } from '../../../models/admin-dashboard.model';
import { SummaryList } from './summary-list';

const UNTRACKED: WeekSummary = {
  ticketsSold: 0,
  seatsSold: 0,
  seatsTotal: 0,
  tripsCompleted: 2,
  tripsUpcoming: 5,
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
  it('shows zero values normally and says "No trips" when no trip ran', () => {
    const { componentInstance } = setup(UNTRACKED);
    expect(componentInstance.rows()).toEqual([
      { label: 'Seats filled', value: 'No trips' },
      { label: 'Trips completed', value: '2' },
      { label: 'Trips in the next 7 days', value: '5' },
      { label: 'Seats open on upcoming trips', value: '41' },
    ]);
  });

  it('shows seats filled as a rounded percentage', () => {
    const { componentInstance } = setup({ ...UNTRACKED, seatsSold: 27, seatsTotal: 41 });
    expect(componentInstance.rows()[0]).toEqual({ label: 'Seats filled', value: '66%' });
  });

  it('leaves out refunds and ratings while they are not tracked', () => {
    const fixture = setup(UNTRACKED);

    expect(fixture.nativeElement.textContent).not.toContain('not tracked');
    expect(fixture.nativeElement.querySelector('.admin-card-footer')).toBeNull();
  });

  it('gives a tracked metric its own row', () => {
    const fixture = setup({ ...UNTRACKED, refundsIssued: 3 });

    expect(fixture.componentInstance.rows().map((row) => row.label)).toContain('Refunds issued');
  });
});
