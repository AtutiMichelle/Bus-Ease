import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { AdminDashboardService } from '../../../services/admin-dashboard.service';
import {
  Departure,
  KpiCardData,
  PaymentSplitData,
  RecentBooking,
  TopRoutesData,
  WeekSummary,
  WidgetState,
} from '../../../models/admin-dashboard.model';
import { KpiCard } from '../kpi-card/kpi-card';
import { SummaryList } from '../summary-list/summary-list';
import { TopRoutesCard } from '../top-routes-card/top-routes-card';
import { PaymentSplitDonut } from '../payment-split-donut/payment-split-donut';
import { BookingsTable } from '../bookings-table/bookings-table';
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
  imports: [KpiCard, SummaryList, TopRoutesCard, PaymentSplitDonut, BookingsTable, DeparturesTable, WidgetError],
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
  ticketsSoldThisWeek = computed(() => {
    const summary = this.weekSummary();
    return summary.status === 'ready' ? summary.data.ticketsSold : null;
  });

  kpiCards = signal<WidgetState<KpiCardData[]>>({ status: 'loading' });
  topRoutes = signal<WidgetState<TopRoutesData>>({ status: 'loading' });
  paymentSplit = signal<WidgetState<PaymentSplitData>>({ status: 'loading' });
  recentBookings = signal<WidgetState<RecentBooking[]>>({ status: 'loading' });
  departuresToday = signal<WidgetState<Departure[]>>({ status: 'loading' });

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

  loadKpiCards(): void {
    this.load(this.kpiCards, () => this.dashboardService.getKpiCards(), 'key metrics');
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

  private load<T>(target: WritableSignal<WidgetState<T>>, fetch: () => Promise<T>, name: string): void {
    target.set({ status: 'loading' });
    fetch()
      .then((data) => target.set({ status: 'ready', data }))
      .catch((error) => {
        console.error(`Dashboard: could not load ${name}`, error);
        target.set({ status: 'error' });
      });
  }
}
