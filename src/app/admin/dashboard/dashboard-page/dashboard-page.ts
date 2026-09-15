import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { AdminDashboardService } from '../../../services/admin-dashboard.service';
import {
  Departure,
  KpiCardData,
  PaymentSplitData,
  RecentBooking,
  TopRoutesData,
  WeekSummary,
} from '../../../models/admin-dashboard.model';
import { KpiCard } from '../kpi-card/kpi-card';
import { SummaryList } from '../summary-list/summary-list';
import { TopRoutesCard } from '../top-routes-card/top-routes-card';
import { PaymentSplitDonut } from '../payment-split-donut/payment-split-donut';
import { BookingsTable } from '../bookings-table/bookings-table';
import { DeparturesTable } from '../departures-table/departures-table';

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
  imports: [KpiCard, SummaryList, TopRoutesCard, PaymentSplitDonut, BookingsTable, DeparturesTable],
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

  weekSummary = signal<WeekSummary | null>(null);
  ticketsSoldThisWeek = computed(() => this.weekSummary()?.ticketsSold ?? null);

  kpiCards = signal<KpiCardData[]>([]);
  topRoutes = signal<TopRoutesData | null>(null);
  paymentSplit = signal<PaymentSplitData | null>(null);
  recentBookings = signal<RecentBooking[]>([]);
  departuresToday = signal<Departure[]>([]);

  constructor() {
    this.dashboardService.getWeekSummary().then((summary) => this.weekSummary.set(summary));
    this.dashboardService.getKpiCards().then((cards) => this.kpiCards.set(cards));
    this.dashboardService.getTopRoutes().then((data) => this.topRoutes.set(data));
    this.dashboardService.getPaymentSplit().then((data) => this.paymentSplit.set(data));
    this.dashboardService.getRecentBookings().then((bookings) => this.recentBookings.set(bookings));
    this.dashboardService.getDeparturesToday().then((departures) => this.departuresToday.set(departures));
  }
}
