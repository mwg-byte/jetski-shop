-- ============================================================
-- Pipeline / scheduling fields  (run once in Supabase → SQL Editor)
-- Adds: a scheduled work date and an estimated repair time to work orders.
-- These power the new "Planner" section (price list, schedule, revenue, paid).
-- ============================================================

alter table public.work_orders
  add column if not exists scheduled_date date,
  add column if not exists est_hours numeric;

-- (optional) speed up the schedule view if you have lots of orders
create index if not exists work_orders_scheduled_date_idx
  on public.work_orders (scheduled_date);
