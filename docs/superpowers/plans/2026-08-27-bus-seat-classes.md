# Bus Seat Classes (VIP/Business/Normal per-bus pricing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single bus offer 1–3 seat classes (VIP, Business, Normal), each with its own price, and show that per-class breakdown on the Results page bus card instead of one badge + one price.

**Architecture:** Add a new `bus_classes` table (one row per bus per class it offers) alongside the existing `buses` table — `buses.bus_type`/`buses.base_price` are left untouched because `seat-panel`, `confirmation`, and `booking.service.ts` still read `Bus.busType`/`Bus.price` singular fields for the current (unchanged) booking flow. `BusService.mapBusRow` gains a `classes` array sourced from the new table via a PostgREST embed, and only the Results page template changes to render it. Nothing about seat selection or per-class booking changes in this plan.

**Tech Stack:** Angular 22 (standalone components, signals), Supabase (Postgres + PostgREST via `@supabase/supabase-js`), Vitest.

**Spec:** This plan file is the spec (translated from the user's chat request — no separate spec doc exists).

## Global Constraints

- Do not remove or repurpose `buses.bus_type` / `buses.base_price` — `seat-panel.ts:26`, `confirmation.ts:24`, and `booking.service.ts` (`total_fare: bus.price * passengers.length`) depend on `Bus.price`/`Bus.busType` today and are explicitly out of scope.
- Do not build seat-level class color coding or a class-selection flow — "Select Seats" keeps navigating exactly as it does today (`selectBus(bus)` in `results.ts`, unchanged).
- Class names are exactly `'VIP' | 'Business' | 'Normal'` (this casing) — the Results template lowercases them for CSS hooks (`chip-vip`, `chip-business`, `chip-normal`), so a typo'd case breaks the styling silently.
- A bus must end up with 1–3 class rows, never 0, and never duplicate class rows for the same bus.
- Per-class prices vary per bus — no hardcoded/identical price across every bus for a given class.
- I (the assistant) only have the Supabase anon/publishable key in this repo (`src/environment.ts`) — no service role key, no linked Supabase CLI project, and the `supabase` MCP connector is unauthenticated in this session. I cannot execute DDL against the live database myself. Task 1 produces a SQL file that **you** run in the Supabase SQL Editor; I can't check it off as "tested" the way the code tasks are.

---

## File Structure

- `supabase/sql/2026-08-27-bus-classes.sql` — **create.** DDL for `bus_classes` + RLS policy + one-time seed/backfill for existing buses. Run manually in the Supabase SQL Editor (see Task 1).
- `src/app/models/bus.model.ts` — **modify.** Add `BusClassOption` interface and `classes: BusClassOption[]` field on `Bus`.
- `src/app/services/bus.service.ts` — **modify.** Extend `BusRow`/`BUS_ROW_SELECT` to embed `bus_classes`, extend `mapBusRow` to populate and sort `classes`.
- `src/app/services/bus.service.spec.ts` — **create.** Unit tests for the new `mapBusRow` behavior (pure function, no Supabase needed).
- `src/app/pages/results/results.html` — **modify.** Replace the single bus-type chip + single price with a per-class chip+price list.
- `src/app/pages/results/results.css` — **modify.** Remove the now-unused chip/price/border rules tied to `busType`; add rules for the new per-class chip list.

## Global Interfaces (shared across tasks)

```ts
// src/app/models/bus.model.ts
export interface BusClassOption {
  className: 'VIP' | 'Business' | 'Normal';
  price: number;
}

export interface Bus {
  id: string;
  operator: string;
  from: string;
  to: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  busType: 'Luxury' | 'Standard' | 'Express';
  price: number;
  seatsAvailable: number;
  totalSeats: number;
  classes: BusClassOption[]; // NEW — 1-3 entries, sorted VIP, Business, Normal
  rating?: number;
}
```

Later tasks rely on exactly this shape: `bus.classes` is always an array (never undefined), sorted VIP → Business → Normal, containing only the classes that bus actually offers.

---

### Task 1: Database — `bus_classes` table + seed

**Files:**
- Create: `supabase/sql/2026-08-27-bus-classes.sql`

**Interfaces:**
- Produces: a `bus_classes` table with columns `id uuid`, `bus_id uuid` (FK → `buses.id`), `class_name text` (`'VIP' | 'Business' | 'Normal'`), `price numeric(10,2)`, readable by the anon key (RLS `select` policy), which Task 2's PostgREST embed (`bus_classes(class_name, price)`) depends on.

This task has no automated test — it's a SQL script you run by hand in the Supabase Dashboard → SQL Editor. There's no CLI project linked in this repo and I only hold the anon key, so I can't run it for you.

- [ ] **Step 1: Write the SQL file**

```sql
-- supabase/sql/2026-08-27-bus-classes.sql
-- Adds per-bus seat classes (VIP/Business/Normal), each with its own price.
-- buses.bus_type / buses.base_price are left in place — the booking/seat-panel/
-- confirmation flow still reads those and is not changed by this script.

create table if not exists bus_classes (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses(id) on delete cascade,
  class_name text not null check (class_name in ('VIP', 'Business', 'Normal')),
  price numeric(10,2) not null check (price > 0),
  created_at timestamptz not null default now(),
  unique (bus_id, class_name)
);

alter table bus_classes enable row level security;

create policy "bus_classes are viewable by everyone"
  on bus_classes for select
  using (true);

-- Seed / backfill: give each existing bus 1-3 classes with varied, realistic
-- prices around the reference points below. Bands are deliberately
-- non-overlapping so that whenever a bus offers more than one class, VIP is
-- always priced above Business, which is always priced above Normal, without
-- needing extra logic to enforce it.
--   Normal:   1700 - 2300  (reference ~2000)
--   Business: 3200 - 3800  (reference ~3500)
--   VIP:      3850 - 4600  (reference ~4000-4200)
-- Inclusion is randomized per class so not every bus offers all three.

insert into bus_classes (bus_id, class_name, price)
select id, 'Normal', (round((1700 + random() * 600) / 10) * 10)::numeric
from buses
where random() < 0.8
on conflict (bus_id, class_name) do nothing;

insert into bus_classes (bus_id, class_name, price)
select id, 'Business', (round((3200 + random() * 600) / 10) * 10)::numeric
from buses
where random() < 0.65
on conflict (bus_id, class_name) do nothing;

insert into bus_classes (bus_id, class_name, price)
select id, 'VIP', (round((3850 + random() * 750) / 10) * 10)::numeric
from buses
where random() < 0.45
on conflict (bus_id, class_name) do nothing;

-- Safety net: any bus that drew "no" on all three coin flips above still
-- needs at least one class, so give it Normal.
insert into bus_classes (bus_id, class_name, price)
select b.id, 'Normal', (round((1700 + random() * 600) / 10) * 10)::numeric
from buses b
where not exists (select 1 from bus_classes bc where bc.bus_id = b.id)
on conflict (bus_id, class_name) do nothing;
```

- [ ] **Step 2: Run it in Supabase**

Open the Supabase Dashboard for this project → SQL Editor → paste the contents of `supabase/sql/2026-08-27-bus-classes.sql` → Run.

- [ ] **Step 3: Verify by hand**

Run this query in the same SQL Editor and eyeball the results:

```sql
select b.id, b.operator, b.bus_type, b.base_price,
       bc.class_name, bc.price
from buses b
left join bus_classes bc on bc.bus_id = b.id
order by b.id, case bc.class_name when 'VIP' then 0 when 'Business' then 1 else 2 end;
```

Confirm:
- Every `bus.id` has at least one `bus_classes` row (no `class_name` is null).
- No bus has more than 3 rows, and no bus has two rows with the same `class_name`.
- Prices vary between buses for the same class (not every VIP row is exactly 4000, etc).
- Where a bus has more than one class, VIP's price > Business's price > Normal's price.

- [ ] **Step 4: Commit**

```bash
git add supabase/sql/2026-08-27-bus-classes.sql
git commit -m "add: bus_classes table and seed for per-class bus pricing"
```

---

### Task 2: `Bus` model + `BusService` — fetch and map per-class prices

**Files:**
- Modify: `src/app/models/bus.model.ts`
- Modify: `src/app/services/bus.service.ts`
- Create: `src/app/services/bus.service.spec.ts`

**Interfaces:**
- Consumes: the `bus_classes` table from Task 1 (via PostgREST embed `bus_classes(class_name, price)` on the `buses` select).
- Produces: `Bus.classes: BusClassOption[]` (see Global Interfaces above) — Task 3's template iterates this directly.

- [ ] **Step 1: Add `BusClassOption` to the model**

Edit `src/app/models/bus.model.ts` to match the Global Interfaces block above exactly (add `BusClassOption` and the new `classes` field on `Bus`).

- [ ] **Step 2: Write the failing test**

Create `src/app/services/bus.service.spec.ts`:

```ts
import { mapBusRow, BusRow } from './bus.service';

function makeRow(overrides: Partial<BusRow> = {}): BusRow {
  return {
    id: '1',
    operator: 'Coast Bus',
    bus_type: 'Luxury',
    base_price: '1800',
    departure_time: '2026-08-27T06:30:00Z',
    arrival_time: '2026-08-27T13:00:00Z',
    total_seats: 44,
    available_seats: 40,
    routes: { origin: 'Nairobi', destination: 'Mombasa', duration_minutes: 390 },
    bus_classes: [],
    ...overrides,
  };
}

describe('mapBusRow classes', () => {
  it('maps bus_classes rows into classes, sorted VIP, Business, Normal', () => {
    const row = makeRow({
      bus_classes: [
        { class_name: 'Normal', price: '1800' },
        { class_name: 'VIP', price: '4200' },
        { class_name: 'Business', price: '3600' },
      ],
    });

    const bus = mapBusRow(row);

    expect(bus.classes).toEqual([
      { className: 'VIP', price: 4200 },
      { className: 'Business', price: 3600 },
      { className: 'Normal', price: 1800 },
    ]);
  });

  it('omits classes the bus does not offer, without inserting placeholders', () => {
    const row = makeRow({ bus_classes: [{ class_name: 'Normal', price: '2000' }] });

    expect(mapBusRow(row).classes).toEqual([{ className: 'Normal', price: 2000 }]);
  });

  it('returns an empty array when bus_classes is empty', () => {
    const row = makeRow({ bus_classes: [] });

    expect(mapBusRow(row).classes).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --watch=false`
Expected: FAIL — `bus.service.spec.ts` errors because `BusRow` has no `bus_classes` property yet (TS compile error) and `mapBusRow` doesn't set `classes`.

- [ ] **Step 4: Implement**

Edit `src/app/services/bus.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { Bus, BusClassOption } from '../models/bus.model';

export interface Seat {
  id: string;
  number: string;
  status: 'available' | 'booked';
}

export interface BusClassRow {
  class_name: string;
  price: string | number;
}

export interface BusRow {
  id: string;
  operator: string;
  bus_type: string;
  base_price: string | number;
  departure_time: string;
  arrival_time: string;
  total_seats: number;
  available_seats: number;
  routes: {
    origin: string;
    destination: string;
    duration_minutes: number;
  };
  bus_classes: BusClassRow[];
}

export const BUS_ROW_SELECT =
  'id, operator, bus_type, base_price, departure_time, arrival_time, total_seats, available_seats, routes!inner(origin, destination, duration_minutes), bus_classes(class_name, price)';

const CLASS_RANK: Record<string, number> = { VIP: 0, Business: 1, Normal: 2 };

function mapClasses(rows: BusClassRow[]): BusClassOption[] {
  return (rows ?? [])
    .map((row) => ({ className: row.class_name as BusClassOption['className'], price: Number(row.price) }))
    .sort((a, b) => (CLASS_RANK[a.className] ?? 99) - (CLASS_RANK[b.className] ?? 99));
}

export function mapBusRow(row: BusRow): Bus {
  return {
    id: row.id,
    operator: row.operator,
    from: row.routes.origin,
    to: row.routes.destination,
    date: toDateString(row.departure_time),
    departureTime: formatTime(row.departure_time),
    arrivalTime: formatTime(row.arrival_time),
    duration: formatDuration(row.routes.duration_minutes),
    busType: row.bus_type as Bus['busType'],
    price: Number(row.base_price),
    seatsAvailable: row.available_seats,
    totalSeats: row.total_seats,
    classes: mapClasses(row.bus_classes),
  };
}
```

(Leave `formatTime`, `formatDuration`, `toDateString`, `seatSortKey`, and the `BusService` class below unchanged — only `BusRow`, `BUS_ROW_SELECT`, and `mapBusRow` change, plus the new `BusClassRow`/`mapClasses` and the `BusClassOption` import.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- --watch=false`
Expected: PASS for the 3 new tests in `bus.service.spec.ts`. Also confirm the rest of the suite has the same pass/fail results as before this change (this repo has 4 pre-existing unrelated failures — `app.spec.ts` x2, `header.spec.ts`, `results.spec.ts` — all `NG0201: No provider found for ActivatedRoute`; don't try to fix those here, just confirm you haven't added new failures).

- [ ] **Step 6: Commit**

```bash
git add src/app/models/bus.model.ts src/app/services/bus.service.ts src/app/services/bus.service.spec.ts
git commit -m "feat: map per-bus seat classes onto the Bus model"
```

---

### Task 3: Results page — per-class price breakdown on the bus card

**Files:**
- Modify: `src/app/pages/results/results.html`
- Modify: `src/app/pages/results/results.css`

**Interfaces:**
- Consumes: `bus.classes: BusClassOption[]` from Task 2 (already sorted VIP → Business → Normal, only containing offered classes).

- [ ] **Step 1: Replace the bus-type chip + single price in the template**

In `src/app/pages/results/results.html`, remove the `busType`-based border class and single chip on the `<article>`/`bus-operator` block, and replace the single `.price` paragraph with a per-class list:

```diff
-      <article class="bus-card" [class]="'bus-type-' + bus.busType.toLowerCase()">
+      <article class="bus-card">
         <div class="bus-main">
           <div class="bus-operator">
             <span class="operator-badge" aria-hidden="true"><i class="fa-solid fa-bus-simple"></i></span>
-            <div>
-              <p class="operator-name">{{ bus.operator }}</p>
-              <span [class]="'bus-type-chip chip-' + bus.busType.toLowerCase()">{{ bus.busType }}</span>
-            </div>
+            <p class="operator-name">{{ bus.operator }}</p>
           </div>
```

```diff
         <div class="ticket-divider" aria-hidden="true"></div>

         <div class="bus-cta">
-          <p class="price"><span class="price-currency">KSh</span>{{ bus.price }}</p>
+          <div class="class-price-list">
+            @for (cls of bus.classes; track cls.className) {
+              <div class="class-price-row">
+                <span [class]="'class-chip chip-' + cls.className.toLowerCase()">{{ cls.className }}</span>
+                <span class="class-price"><span class="price-currency">KSh</span>{{ cls.price }}</span>
+              </div>
+            }
+          </div>
           <button type="button" (click)="selectBus(bus)">
             Select Seats <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
           </button>
         </div>
```

The full `<article>` block should read:

```html
<article class="bus-card">
  <div class="bus-main">
    <div class="bus-operator">
      <span class="operator-badge" aria-hidden="true"><i class="fa-solid fa-bus-simple"></i></span>
      <p class="operator-name">{{ bus.operator }}</p>
    </div>

    <div class="bus-times">
      <div class="time-block">
        <p class="time">{{ bus.departureTime }}</p>
        <p class="time-label">{{ bus.from }}</p>
      </div>
      <div class="duration-block">
        <div class="duration-track">
          <p class="duration">{{ bus.duration }}</p>
          <div class="duration-line">
            <span class="route-dot route-dot-start" aria-hidden="true"></span>
            <span class="route-bus" aria-hidden="true"><i class="fa-solid fa-bus"></i></span>
            <span class="route-dot route-dot-end" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="time-block">
        <p class="time">{{ bus.arrivalTime }}</p>
        <p class="time-label">{{ bus.to }}</p>
      </div>
    </div>

    <div class="bus-rating">
      <span class="seats-left" [class.seats-low]="bus.seatsAvailable <= 5">
        <i class="fa-solid fa-couch" style="color: #1e88e5;"></i>{{ bus.seatsAvailable }} seats left
      </span>
    </div>
  </div>

  <div class="ticket-divider" aria-hidden="true"></div>

  <div class="bus-cta">
    <div class="class-price-list">
      @for (cls of bus.classes; track cls.className) {
        <div class="class-price-row">
          <span [class]="'class-chip chip-' + cls.className.toLowerCase()">{{ cls.className }}</span>
          <span class="class-price"><span class="price-currency">KSh</span>{{ cls.price }}</span>
        </div>
      }
    </div>
    <button type="button" (click)="selectBus(bus)">
      Select Seats <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    </button>
  </div>
</article>
```

(The `fa-couch` seats icon and its inline `color: #1e88e5` style are left exactly as they are today — not part of this change.)

- [ ] **Step 2: Update the CSS**

In `src/app/pages/results/results.css`:

Remove these now-unused rules (they were keyed off `busType`, which no longer drives any visual on this card):

```css
.bus-card.bus-type-luxury {
  border-left-color: var(--color-accent-dark, #d68c0f);
}

.bus-card.bus-type-express {
  border-left-color: var(--color-accent, #eb1f1a);
}
```

```css
.bus-type-chip {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-radius: 999px;
  padding: 3px 10px;
}

.chip-standard {
  color: var(--color-primary, #1a3a6b);
  background-color: var(--color-soft-bg, #e8f1fc);
}

.chip-luxury {
  color: #7a5108;
  background-color: #fbf0da;
}

.chip-express {
  color: var(--color-accent, #eb1f1a);
  background-color: #fce9e8;
}
```

Replace the old single-price rules:

```css
.price {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-primary, #1a3a6b);
}
```

with the new per-class list rules (keep the existing `.price-currency` rule as-is — it's reused inside `.class-price`):

```css
.class-price-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.class-price-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.class-chip {
  display: inline-block;
  min-width: 62px;
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-radius: 999px;
  padding: 2px 9px;
}

.chip-vip {
  color: #7a5108;
  background-color: #fbf0da;
}

.chip-business {
  color: var(--color-primary, #1a3a6b);
  background-color: var(--color-soft-bg, #e8f1fc);
}

.chip-normal {
  color: #1f7a5c;
  background-color: #e3f5ee;
}

.class-price {
  font-size: 1.05rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--color-primary, #1a3a6b);
}
```

`.operator-name` currently has `margin: 0 0 6px 0` (spacing for the chip that used to sit under it) — change that to `margin: 0` since `.bus-operator` is now a single-line badge+name row with nothing below it:

```diff
 .operator-name {
   font-size: 1.13rem;
   font-weight: 700;
   color: var(--color-primary, #1a3a6b);
-  margin: 0 0 6px 0;
+  margin: 0;
 }
```

- [ ] **Step 3: Verify visually**

Run `npm start`, wait for it to be ready on `http://localhost:4200`, then either:
- Click a Popular Routes card on the home page (e.g. Nairobi → Mombasa) to land on Results with real seeded data, or
- Navigate directly to `http://localhost:4200/results?origin=Nairobi&destination=Mombasa&journeyDate=<today>`.

Confirm on each card:
- No "LUXURY"/"EXPRESS"/"STANDARD" badge or single big price remains.
- One row per class the bus actually offers (1–3 rows), each showing `<CHIP> KSh <price>`, VIP above Business above Normal.
- A bus with only 1-2 classes shows only those rows — no blank/placeholder row for a missing class.
- "Select Seats" still opens the seat panel exactly as before.
- Card still looks reasonable at a mobile width (~420px) — the class rows and button should stack sensibly since `.bus-cta` already switches to `align-items: stretch` under the existing `@media (max-width: 700px)` block.

- [ ] **Step 4: Run the full check**

Run: `npx ng build --configuration development` — expect it to succeed.
Run: `npm test -- --watch=false` — expect the same pass/fail counts as after Task 2 (no new failures).

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/results/results.html src/app/pages/results/results.css
git commit -m "update: show per-class prices on the results page bus card"
```

---

## Self-Review

**Spec coverage:**
- "Add a bus_classes table... bus_id, class_name (VIP, Business, Normal), price... 1-3 rows... not every bus offers all three" → Task 1.
- "Migrate/seed existing buses with realistic, varied pricing... VIP ~4000, Business ~3500, Normal ~2000... own price within a reasonable range... not identical across all buses" → Task 1 seed step, non-overlapping random bands per class.
- "Update bus card to list each class the bus actually offers with its own price... omit missing classes entirely, no N/A/placeholder" → Task 3 (`@for` over `bus.classes`, which only ever contains offered classes — Task 2's tests pin this down).
- "Remove/replace the old single badge+single price display" → Task 3 Step 1/2 explicitly removes `.bus-type-chip`/`chip-*`/`bus-type-*` border rules and the single `.price` rule.
- "Keep Select Seats button behavior as-is... don't build [class selection] yet" → called out in Global Constraints; `results.ts` (`selectBus`, `closeSeatPanel`) is untouched by this plan, verified in Task 3 Step 3.

**Placeholder scan:** No TBD/"add appropriate"/"similar to Task N" — every step has literal SQL/TS/HTML/CSS to write.

**Type consistency:** `BusClassOption.className` (bus.model.ts) → `BusClassRow.class_name` cast to `BusClassOption['className']` (bus.service.ts) → `cls.className` in the template (results.html) — same name and union type used throughout. `bus.classes` is produced once (Task 2) and consumed once (Task 3), no signature drift.
