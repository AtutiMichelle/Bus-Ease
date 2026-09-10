import { Routes } from '@angular/router';
import { authGuard, bookingAccessGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
        title: 'BusEase - Book Bus Tickets',
    },
    {
        // Sign in/up is now a modal (see AuthModalService) that overlays whatever
        // page is current, rather than a page of its own — these redirects just
        // keep old /login and /signup links from dead-ending.
        path: 'login',
        redirectTo: '/',
    },
    {
        path: 'signup',
        redirectTo: '/',
    },
    {
        path: 'results',
        loadComponent: () => import('./pages/results/results').then((m) => m.Results),
        title: 'Available Buses - BusEase',
    },
    {
        path: 'confirmation',
        loadComponent: () => import('./pages/confirmation/confirmation').then((m) => m.Confirmation),
        canActivate: [bookingAccessGuard],
        title: 'Passenger Details - BusEase',
    },
    {
        path: 'payment',
        loadComponent: () => import('./pages/payment/payment').then((m) => m.Payment),
        canActivate: [bookingAccessGuard],
        title: 'Payment - BusEase',
    },
    {
        path: 'ticket',
        loadComponent: () => import('./pages/ticket/ticket').then((m) => m.Ticket),
        canActivate: [bookingAccessGuard],
        title: 'Booking Confirmed - BusEase',
    },
    {
        path: 'contact',
        loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
        title: 'Contact Us - BusEase',
    },
    {
        // My Bookings is now a tab on the account page rather than its own
        // page — this redirect just keeps old /my-bookings links from dead-ending.
        path: 'my-bookings',
        redirectTo: '/account',
    },
    {
        path: 'account',
        loadComponent: () => import('./pages/account/account').then((m) => m.AccountPageComponent),
        canActivate: [authGuard],
        title: 'My Account - BusEase',
    },
];
