# BusEase

BusEase is an Angular web app for searching, booking, and managing intercity bus tickets across Kenya.

## Features

- Search buses by origin, destination, and travel date, with Kenyan town autocomplete
- Browse search results with operator, schedule, rating, seats left, and pricing
- Interactive seat map with a clear center aisle and driver/door indicators
- Booking confirmation with a generated reference and a printable ticket
- Booking history stored locally and viewable on the My Bookings page
- Login and sign up pages
- Contact page with a message form
- About section with platform stats, linked from the navbar

## Tech stack

- Angular 22 (standalone components, signals, `@if`/`@for` control flow)
- TypeScript
- Vitest for unit tests

## Project structure

```
src/app/
  components/   Header and footer, shared across all pages
  models/       Bus and booking data shapes
  pages/        home, login, signup, results, seats, confirmation, contact, my-bookings
  services/     Mock bus search (BusService) and local booking persistence (BookingService)
```

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Building

To build the project, run:

```bash
npm run build
```

This compiles the project and stores the build artifacts in the `dist/` directory. By default, the production build optimizes the application for performance and speed.

## Running unit tests

To execute unit tests with the Vitest test runner, use:

```bash
npm test
```

