# BusEase

BusEase is an Angular web app for searching, booking and paying for intercity bus tickets in Kenya. Travellers can book by tapping through the pages or by talking to a voice assistant. Staff manage trips, routes, bookings and customers in an admin area.

## Features

- **Search** buses by origin, destination and date, with city suggestions
- **Results** with operator, times, seats left and prices, filtered by seat type, departure time, amenities, bus type and bus partner
- **Seat map** drawn from the trip source's own layout, with seat classes and prices
- **Passenger details**, then an unpaid **seat hold** with a countdown
- **M-Pesa payment** by STK push, then a **ticket** page with a printable ticket
- **Account** with My Bookings, profile, wallet and settings
- **Sign in and sign up** in a modal, with a server-side lockout after repeated failed logins
- **Voice assistant** that can search, pick a bus and seats, fill in details and start payment
- **Admin area** with a dashboard, trips, routes, bookings and customers, where what each staff role sees is set per role

## Tech stack

- Angular 22 (standalone components, signals, `@if` / `@for`), TypeScript
- Supabase: database, auth, storage and edge functions
- Vitest for unit tests, GitHub Actions for CI

## How it fits together

```
Browser (Angular app)
  ├── pages and components
  │     └── TRIP_PROVIDER ─┬── Travler provider ──► travler edge function ──► Travler booking API
  │                        └── Supabase provider ──► BusEase's own buses tables
  ├── voice assistant ─────────► assistant edge function ──► AI model (Groq)
  └── login ───────────────────► login edge function ──► Supabase Auth
```

**Trip sources.** Every booking page talks to one interface, `TripProvider` (`src/app/trips/trip-provider.ts`). Two sources implement it:

- **Travler** (`src/app/trips/providers/travler/`): the external booking API. Adapters turn its raw replies into BusEase models, so pages never see the API's own shapes.
- **Supabase** (`src/app/trips/providers/supabase/`): BusEase's own buses, seats and bookings tables.

Which one is live is set by `tripProvider` in `src/environment.ts` and `src/environment.prod.ts`. Pages don't need to know which one it is.

**Booking flow.** Search bar → Results → Seat panel → Confirmation (passenger details and seat hold) → Payment → Ticket. What the traveller has picked so far is kept in `BookingDraftService`, which survives a page reload in the same tab.

**Edge functions** (`supabase/functions/`) keep every secret key on the server:

| Function | What it does | Secrets it needs |
| --- | --- | --- |
| `travler` | Forwards only the booking endpoints BusEase uses, checks each request body, applies rate limits | `TRAVLER_API_URL`, `TRAVLER_API_KEY`, `ALLOWED_ORIGINS` |
| `assistant` | Asks the AI model for the voice assistant's replies, with rate limits | `GROQ_API_KEY`, `ALLOWED_ORIGINS` |
| `login` | Signs in through Supabase Auth and locks an email out after repeated failures | `ALLOWED_ORIGINS` |

Set a secret with `supabase secrets set NAME=value`. Deploy a function with `supabase functions deploy <name>`. The comment at the top of each function's `index.ts` lists what it needs.

## Project structure

```
src/app/
  admin/          Admin area: pages, its own services and models, staff role access
  components/     Shared pieces: header, footer, search bar, seat panel, filters, sign-in modal
  guards/         Route guards (signed in, staff role, booking in progress)
  interceptors/   HTTP interceptors (Supabase auth header, request timeout)
  models/         BusEase data shapes used across the app
  pages/          One folder per page: home, results, confirmation, payment, ticket, account, ...
  services/       App-wide services: auth, bookings, wallet, staff role, booking draft
  trips/          The TripProvider interface, its errors, and the providers/ that implement it
  utils/          Small helpers: dates, money, validation, filters
  voice/          Voice assistant: speech, parsing, the AI model, and one step per page
supabase/functions/  Edge functions (see above)
```

## Running it locally

```bash
npm install
npm start
```

Then open `http://localhost:4200/`.

In development, `src/environment.ts` points the Travler source at a local mock server on `http://localhost:4010/globalApi`. Start the mock separately (it's its own project) before searching for buses, or set `tripProvider` to `'supabase'` to use BusEase's own tables.

To step through the voice assistant's looks without speaking, open any page with `?voiceDemo=1` in development.

## Tests and builds

```bash
npm test            # unit tests in watch mode
npm test -- --watch=false
npm run build       # production build into dist/
```

CI (`.github/workflows/ci.yml`) runs the build and the tests on every push and pull request.

The production build downloads Google Fonts to inline them, so it needs internet access. Without it, use `npx ng build --configuration development`.
