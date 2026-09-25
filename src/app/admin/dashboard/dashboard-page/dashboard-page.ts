import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { AdminDashboardService } from '../../../services/admin-dashboard.service';
import {
  DeparturesData,
  KpiCardData,
  KpiPeriod,
  PaymentSplitData,
  RecentBooking,
  TopRoutesData,
  WeekSummary,
  WidgetState,
} from '../../../models/admin-dashboard.model';
import { ICONS } from '../../admin-nav';
import { AdminIcon } from '../../icon/admin-icon';
import { KpiCard } from '../kpi-card/kpi-card';
import { SummaryList } from '../summary-list/summary-list';
import { TopRoutesCard } from '../top-routes-card/top-routes-card';
import { PaymentSplitDonut } from '../payment-split-donut/payment-split-donut';
import { RecentBookingsCard } from '../recent-bookings-card/recent-bookings-card';
import { DeparturesTable } from '../departures-table/departures-table';
import { WidgetError } from '../widget-error/widget-error';

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function formatGreetingDate(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${date.getDate()} ${month}`;
}

/** How the greeting line names each period. */
const PERIOD_PHRASE: Record<KpiPeriod, string> = {
  today: 'today',
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
};

@Component({
  imports: [AdminIcon, KpiCard, SummaryList, TopRoutesCard, PaymentSplitDonut, RecentBookingsCard, DeparturesTable, WidgetError],
  selector: 'app-dashboard-page',
  styleUrl: './dashboard-page.css',
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  private authService = inject(AuthService);
  private dashboardService = inject(AdminDashboardService);
  private router = inject(Router);

  adminFirstName = computed(() => this.authService.displayName().split(/\s+/)[0] ?? this.authService.displayName());

  readonly today = new Date();
  greeting = computed(() => greetingForHour(this.today.getHours()));
  greetingDate = computed(() => formatGreetingDate(this.today));

  // Each widget loads on its own, so one failed query only puts that card
  // into its error state (with its own retry) and never blanks the page.
  weekSummary = signal<WidgetState<WeekSummary>>({ status: 'loading' });

  /** Second half of the line under the greeting, e.g. "137 tickets sold in
   * the last 7 days". Empty until the summary loads. */
  ticketsInPeriod = computed(() => {
    const state = this.weekSummary();
    if (state.status !== 'ready') {
      return '';
    }
    const count = state.data.ticketsSold;
    return `${count.toLocaleString('en-US')} ${count === 1 ? 'ticket' : 'tickets'} sold ${PERIOD_PHRASE[this.period()]}`;
  });

  readonly icons = ICONS;

  /** The period switch next to Publish. It drives the stat cards and the
   * summary, top routes and payment cards. The two tables below keep their
   * own windows (latest bookings, departures today). */
  readonly periods: { value: KpiPeriod; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
  ];
  period = signal<KpiPeriod>('7d');
  /** Bumped on every period switch. Switching quickly can finish out of
   * order, so a response only lands if no switch happened since it began. */
  private periodRequest = 0;

  kpiCards = signal<WidgetState<KpiCardData[]>>({ status: 'loading' });
  topRoutes = signal<WidgetState<TopRoutesData>>({ status: 'loading' });
  paymentSplit = signal<WidgetState<PaymentSplitData>>({ status: 'loading' });
  recentBookings = signal<WidgetState<RecentBooking[]>>({ status: 'loading' });
  departuresToday = signal<WidgetState<DeparturesData>>({ status: 'loading' });

  /** Placeholder slots shown while the stat cards load. */
  readonly kpiPlaceholders = [0, 1, 2, 3];

  publishTrip(): void {
    this.router.navigate(['/admin/trips'], { queryParams: { new: 1 } });
  }

  constructor() {
    this.loadWeekSummary();
    this.loadKpiCards();
    this.loadTopRoutes();
    this.loadPaymentSplit();
    this.loadRecentBookings();
    this.loadDeparturesToday();
  }

  loadWeekSummary(): void {
    const period = this.period();
    this.load(this.weekSummary, () => this.dashboardService.getSummary(period), 'summary', this.isLatest());
  }

  setPeriod(period: KpiPeriod): void {
    if (period === this.period()) {
      return;
    }
    this.period.set(period);
    this.periodRequest++;
    this.loadWeekSummary();
    this.loadKpiCards();
    this.loadTopRoutes();
    this.loadPaymentSplit();
  }

  loadKpiCards(): void {
    const period = this.period();
    this.load(this.kpiCards, () => this.dashboardService.getKpiCards(period), 'key metrics', this.isLatest());
  }

  loadTopRoutes(): void {
    const period = this.period();
    this.load(this.topRoutes, () => this.dashboardService.getTopRoutes(period), 'top routes', this.isLatest());
  }

  loadPaymentSplit(): void {
    const period = this.period();
    this.load(this.paymentSplit, () => this.dashboardService.getPaymentSplit(period), 'payment split', this.isLatest());
  }

  /** True while no period switch has happened since this call. */
  private isLatest(): () => boolean {
    const request = this.periodRequest;
    return () => request === this.periodRequest;
  }

  loadRecentBookings(): void {
    this.load(this.recentBookings, () => this.dashboardService.getRecentBookings(), 'recent bookings');
  }

  loadDeparturesToday(): void {
    this.load(this.departuresToday, () => this.dashboardService.getDeparturesToday(), 'departures');
  }

  private load<T>(
    target: WritableSignal<WidgetState<T>>,
    fetch: () => Promise<T>,
    name: string,
    isCurrent: () => boolean = () => true,
  ): void {
    target.set({ status: 'loading' });
    fetch()
      .then((data) => {
        if (isCurrent()) {
          target.set({ status: 'ready', data });
        }
      })
      .catch((error) => {
        console.error(`Dashboard: could not load ${name}`, error);
        if (isCurrent()) {
          target.set({ status: 'error' });
        }
      });
  }
}
