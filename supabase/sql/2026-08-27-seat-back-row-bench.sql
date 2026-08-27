-- Adds a real fifth seat to the back row of every bus. In most real buses
-- the back row is a plain bench spanning the full width with no aisle gap,
-- so it seats 5 instead of 4. This adds that seat as a genuine, bookable
-- `seats` row (not a decorative filler) in the middle position ("<row>E"),
-- inheriting the same bus_classes row already assigned to the rest of that
-- back row, and bumps buses.total_seats / available_seats to match.
--
-- Idempotent: only touches buses that don't already have a back-row "E"
-- seat, so re-running is a no-op.

with last_row as (
  select
    bus_id,
    max((regexp_match(seat_number, '^(\d+)'))[1]::int) as row_num
  from seats
  group by bus_id
),
last_row_seat as (
  -- One representative seat from each bus's back row, to source the new
  -- seat's class from (the earlier backfill assigns a whole row to one
  -- class, so any seat in the row carries the right bus_class_id).
  select distinct on (s.bus_id)
    s.bus_id,
    lr.row_num,
    s.bus_class_id
  from seats s
  join last_row lr on lr.bus_id = s.bus_id
    and (regexp_match(s.seat_number, '^(\d+)'))[1]::int = lr.row_num
  order by s.bus_id, s.seat_number
),
to_insert as (
  select lrs.bus_id, lrs.row_num, lrs.bus_class_id
  from last_row_seat lrs
  where not exists (
    select 1 from seats s2
    where s2.bus_id = lrs.bus_id
      and s2.seat_number = lrs.row_num || 'E'
  )
),
inserted as (
  insert into seats (bus_id, seat_number, status, bus_class_id)
  select bus_id, row_num || 'E', 'available', bus_class_id
  from to_insert
  returning bus_id
)
update buses b
set total_seats = total_seats + 1,
    available_seats = available_seats + 1
from inserted i
where b.id = i.bus_id;
