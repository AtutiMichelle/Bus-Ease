import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
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

@Component({
  imports: [AdminIcon, KpiCard, SummaryList, TopRoutesCard, PaymentSplitDonut, RecentBookingsCard, DeparturesTable, WidgetError],
  selector: 'app-dashboard-page',
  styleUrl: './dashboard-page.css',
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  private authService = inject(AuthService);
  private dashboardService = inject(AdminDashboardService);

  adminFirstName = computed(() => this.authService.displayName().split(/\s+/)[0] ?? this.authService.displayName());

  readonly today = new Date();
  greeting = computed(() => greetingForHour(this.today.getHours()));
  greetingDate = computed(() => formatGreetingDate(this.today));

  // Each widget loads on its own, so one failed query only puts that card
  // into its error state (with its own retry) and never blanks the page.
  weekSummary = signal<WidgetState<WeekSummary>>({ status: 'loading' });

  readonly icons = ICONS;

  /** The Performance control. It drives the four stat cards only; the cards
   * further down stay on their own fixed windows. */
  readonly periods: { value: KpiPeriod; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
  ];
  period = signal<KpiPeriod>('7d');
  private kpiRequest = 0;

  kpiCards = signal<WidgetState<KpiCardData[]>>({ status: 'loading' });
  topRoutes = signal<WidgetState<TopRoutesData>>({ status: 'loading' });
  paymentSplit = signal<WidgetState<PaymentSplitData>>({ status: 'loading' });
  recentBookings = signal<WidgetState<RecentBooking[]>>({ status: 'loading' });
  departuresToday = signal<WidgetState<DeparturesData>>({ status: 'loading' });

  /** Placeholder slots shown while the stat cards load. */
  readonly kpiPlaceholders = [0, 1, 2, 3];

  constructor() {
    this.loadWeekSummary();
    this.loadKpiCards();
    this.loadTopRoutes();
    this.loadPaymentSplit();
    this.loadRecentBookings();
    this.loadDeparturesToday();
  }

  loadWeekSummary(): void {
    this.load(this.weekSummary, () => this.dashboardService.getWeekSummary(), 'week summary');
  }

  setPeriod(period: KpiPeriod): void {
    if (period === this.period()) {
      return;
    }
    this.period.set(period);
    this.loadKpiCards();
  }

  loadKpiCards(): void {
    // Switching periods quickly can finish out of order, so only the latest
    // request is allowed to update the cards.
    const request = ++this.kpiRequest;
    const period = this.period();
    this.load(
      this.kpiCards,
      () => this.dashboardService.getKpiCards(period),
      'key metrics',
      () => request === this.kpiRequest,
    );
  }

  loadTopRoutes(): void {
    this.load(this.topRoutes, () => this.dashboardService.getTopRoutes(), 'top routes');
  }

  loadPaymentSplit(): void {
    this.load(this.paymentSplit, () => this.dashboardService.getPaymentSplit(), 'payment split');
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
