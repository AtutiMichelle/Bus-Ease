import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
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
    },
    {
        path: 'confirmation',
        loadComponent: () => import('./pages/confirmation/confirmation').then((m) => m.Confirmation),
        canActivate: [authGuard],
    },
    {
        path: 'contact',
        loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
    },
    {
        path: 'my-bookings',
        loadComponent: () => import('./pages/my-bookings/my-bookings').then((m) => m.MyBookings),
        canActivate: [authGuard],
    },
];
