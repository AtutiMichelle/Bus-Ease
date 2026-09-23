import { Routes } from '@angular/router';
import { authGuard, bookingAccessGuard, sectionGuard, staffGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
        title: 'BusEase - Book Bus Tickets',
    },
    {
        // Sign in/up is now a modal (see AuthModalService) that overlays whatever
        // page is current, rather than a page of its own, these redirects just
        // keep old /login and /signup links from dead-ending.
        path: 'login',
        redirectTo: '/',
    },
    {
        path: 'signup',
        redirectTo: '/',
    },
    {
        path: 'forgot-password',
        loadComponent: () => import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword),
        title: 'Forgot Password - BusEase',
    },
    {
        path: 'reset-password',
        loadComponent: () => import('./pages/reset-password/reset-password').then((m) => m.ResetPassword),
        title: 'Reset Password - BusEase',
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
        // page, this redirect just keeps old /my-bookings links from dead-ending.
        path: 'my-bookings',
        redirectTo: '/account',
    },
    {
        path: 'account',
        loadComponent: () => import('./pages/account/account').then((m) => m.AccountPageComponent),
        canActivate: [authGuard],
        title: 'My Account - BusEase',
    },
    {
        path: 'admin',
        loadComponent: () => import('./admin/shell/admin-shell').then((m) => m.AdminShell),
        canActivate: [staffGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./admin/dashboard/dashboard-page/dashboard-page').then((m) => m.DashboardPage),
                canActivate: [sectionGuard('dashboard')],
                title: 'Admin Dashboard - BusEase',
            },
            {
                path: 'bookings',
                loadComponent: () => import('./admin/bookings/bookings-page/bookings-page').then((m) => m.BookingsPage),
                canActivate: [sectionGuard('bookings')],
                title: 'Bookings - BusEase Admin',
            },
            {
                path: 'routes',
                loadComponent: () => import('./admin/routes/routes-page/routes-page').then((m) => m.RoutesPage),
                canActivate: [sectionGuard('routes')],
                title: 'Routes - BusEase Admin',
            },
            {
                path: 'trips',
                loadComponent: () => import('./admin/trips/trips-page/trips-page').then((m) => m.TripsPage),
                canActivate: [sectionGuard('fleet')],
                title: 'Trips - BusEase Admin',
            },
            {
                path: 'customers',
                loadComponent: () => import('./admin/customers/customers-page/customers-page').then((m) => m.CustomersPage),
                canActivate: [sectionGuard('customers')],
                title: 'Customers - BusEase Admin',
            },
            {
                path: 'no-access',
                loadComponent: () => import('./admin/no-access/no-access-page').then((m) => m.NoAccessPage),
                title: 'No access - BusEase Admin',
            },
        ],
    },
];
