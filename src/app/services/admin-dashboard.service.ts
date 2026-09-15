import { Injectable } from '@angular/core';
import {
  Departure,
  KpiCardData,
  PaymentSplitData,
  RecentBooking,
  TopRoutesData,
  WeekSummary,
} from '../models/admin-dashboard.model';

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 200));
}

/** Typed mock data for the admin dashboard, one method per card. Every
 * method keeps the async shape a real Supabase query would have (Promise,
 * same return type) so swapping the body for a real `this.client.from(...)`
 * call later doesn't change any caller. TODO: replace each mock body with
 * the matching Supabase query once the admin dashboard's data needs are
 * fully mapped out. */
@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  async getWeekSummary(): Promise<WeekSummary> {
    return delay({
      ticketsSold: 137,
      tripsCompleted: 18,
      refundsIssued: 4,
      seatsOpenToday: 61,
      averageRating: 4.6,
    });
  }

  async getKpiCards(): Promise<KpiCardData[]> {
    return delay([
      {
        label: 'Tickets sold',
        value: '137',
        delta: { direction: 'up', text: '12% this week' },
        tone: 'red',
        sparkline: [4, 6, 5, 8, 7, 10, 12],
      },
      {
        label: 'Revenue',
        value: 'KSh 389k',
        delta: { direction: 'up', text: '8% this week' },
        tone: 'moss',
        sparkline: [12, 14, 13, 15, 17, 16, 19],
      },
      {
        label: 'Awaiting payment',
        value: '3',
        delta: { direction: 'warning', text: 'Oldest 2 hours ago' },
        tone: 'gold',
        sparkline: [1, 2, 1, 3, 2, 3, 3],
      },
      {
        label: 'New customers',
        value: '74',
        delta: { direction: 'up', text: '6% this week' },
        tone: 'navy',
        sparkline: [8, 9, 8, 10, 11, 10, 12],
      },
    ]);
  }

  async getTopRoutes(): Promise<TopRoutesData> {
    return delay({
      routes: [
        {
          code: 'MSA',
          name: 'Nairobi → Mombasa',
          ticketCount: 62,
          revenue: 175200,
          delta: { direction: 'up', text: '14%' },
          tone: 'red',
        },
        {
          code: 'KIS',
          name: 'Nairobi → Kisumu',
          ticketCount: 34,
          revenue: 97350,
          delta: { direction: 'up', text: '9%' },
          tone: 'navy',
        },
        {
          code: 'ELD',
          name: 'Nairobi → Eldoret',
          ticketCount: 23,
          revenue: 66200,
          delta: { direction: 'down', text: '3%' },
          tone: 'navy',
        },
      ],
      noSalesRoutes: ['Nakuru', 'Kakamega'],
    });
  }

  async getPaymentSplit(): Promise<PaymentSplitData> {
    return delay({
      totalCollected: 389000,
      slices: [
        { label: 'M-Pesa', amount: 311200, percent: 80, tone: 'red' },
        { label: 'Card', amount: 54460, percent: 14, tone: 'navy' },
        { label: 'BusEase wallet', amount: 23340, percent: 6, tone: 'navy' },
      ],
      failedPayments: 3,
    });
  }

  async getRecentBookings(limit = 6): Promise<RecentBooking[]> {
    const bookings: RecentBooking[] = [
      {
        reference: 'BE-10482',
        customerName: 'Michelle Atuti',
        customerInitials: 'MA',
        bookedAt: '2026-09-15T08:26:00',
        route: 'Nairobi → Mombasa',
        amount: 3520,
        status: 'Paid',
      },
      {
        reference: 'BE-10481',
        customerName: 'Brian Otieno',
        customerInitials: 'BO',
        bookedAt: '2026-09-15T07:58:00',
        route: 'Nairobi → Kisumu',
        amount: 2450,
        status: 'Paid',
      },
      {
        reference: 'BE-10480',
        customerName: 'Grace Wanjiru',
        customerInitials: 'GW',
        bookedAt: '2026-09-15T07:20:00',
        route: 'Nairobi → Eldoret',
        amount: 1800,
        status: 'Unpaid',
      },
      {
        reference: 'BE-10479',
        customerName: 'Kevin Mwangi',
        customerInitials: 'KM',
        bookedAt: '2026-09-15T06:47:00',
        route: 'Nairobi → Mombasa',
        amount: 3520,
        status: 'Paid',
      },
      {
        reference: 'BE-10478',
        customerName: 'Faith Njeri',
        customerInitials: 'FN',
        bookedAt: '2026-09-14T21:12:00',
        route: 'Nairobi → Kisumu',
        amount: 2450,
        status: 'Refunded',
      },
      {
        reference: 'BE-10477',
        customerName: 'Dennis Kiptoo',
        customerInitials: 'DK',
        bookedAt: '2026-09-14T19:03:00',
        route: 'Nairobi → Eldoret',
        amount: 1800,
        status: 'Paid',
      },
    ];
    return delay(bookings.slice(0, limit));
  }

  async getDeparturesToday(): Promise<Departure[]> {
    return delay([
      { time: '07:00', route: 'Nairobi → Mombasa', seatsSold: 41, totalSeats: 45, status: 'Departed' },
      { time: '09:30', route: 'Nairobi → Kisumu', seatsSold: 28, totalSeats: 45, status: 'Boarding' },
      { time: '11:00', route: 'Nairobi → Eldoret', seatsSold: 44, totalSeats: 45, status: 'Scheduled' },
      { time: '13:30', route: 'Nairobi → Mombasa', seatsSold: 19, totalSeats: 45, status: 'Scheduled' },
      { time: '16:00', route: 'Nairobi → Kisumu', seatsSold: 12, totalSeats: 45, status: 'Scheduled' },
      { time: '19:00', route: 'Nairobi → Mombasa', seatsSold: 8, totalSeats: 45, status: 'Scheduled' },
    ]);
  }
}
