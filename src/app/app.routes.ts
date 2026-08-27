import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    },
    {
        path: 'login',
        loadComponent: () => import('./pages/login/login').then((m) => m.Login),
    },
    {
        path: 'signup',
        loadComponent: () => import('./pages/signup/signup').then((m) => m.Signup),
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
