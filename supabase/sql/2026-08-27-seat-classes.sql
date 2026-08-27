-- Assigns every existing seat to one of its bus's own bus_classes rows, so
-- the seat map can show real per-seat class colors/prices instead of a
-- single flat price per bus.
--
-- Assignment rule: seats are grouped by their row number (the leading
-- digits of seat_number, e.g. "3" in "3B"), and rows are split
-- proportionally front-to-back across however many classes that bus
-- offers (1, 2, or 3), in VIP -> Business -> Normal priority order —
-- front rows get the higher-tier class. This is deterministic (no
-- random()), so re-running this script produces the same result every
-- time.

alter table seats add column if not exists bus_class_id uuid references bus_classes(id);

with seat_rows_num as (
  select
    s.id as seat_id,
    s.bus_id,
    (regexp_match(s.seat_number, '^(\d+)'))[1]::int as row_num
  from seats s
),
distinct_rows as (
  select
    bus_id,
    row_num,
    dense_rank() over (partition by bus_id order by row_num) as row_rank,
    count(*) over (partition by bus_id) as total_rows
  from (select distinct bus_id, row_num from seat_rows_num) d
),
bus_class_counts as (
  select bus_id, count(*) as class_count
  from bus_classes
  group by bus_id
),
bus_class_ranked as (
  select
    bc.id as bus_class_id,
    bc.bus_id,
    row_number() over (
      partition by bc.bus_id
      order by case bc.class_name when 'VIP' then 0 when 'Business' then 1 else 2 end
    ) as class_rank
  from bus_classes bc
),
row_target_rank as (
  select
    dr.bus_id,
    dr.row_num,
    ceil(dr.row_rank::numeric * bcc.class_count / dr.total_rows)::int as target_class_rank
  from distinct_rows dr
  join bus_class_counts bcc on bcc.bus_id = dr.bus_id
)
update seats s
set bus_class_id = bcr.bus_class_id
from seat_rows_num srn
join row_target_rank rtr on rtr.bus_id = srn.bus_id and rtr.row_num = srn.row_num
join bus_class_ranked bcr on bcr.bus_id = rtr.bus_id and bcr.class_rank = rtr.target_class_rank
where s.id = srn.seat_id;
