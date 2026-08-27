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

drop policy if exists "bus_classes are viewable by everyone" on bus_classes;

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
