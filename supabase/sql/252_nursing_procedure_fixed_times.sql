-- Samara Care ERP · 2.18.27 — Nursing Procedures at fixed times (like medicines)
-- Request (Boomi, 19-10-2026): a planned Nursing Procedure can have fixed times, e.g. Nebulization at
-- 08:00, 14:00, 20:00. Each time is its own task (Shift Tasks, screensaver) and is recorded separately.
--   * care_orders.scheduled_times : the fixed times (HH:MM) of a procedure; empty = any time in the shift
--   * care_logs.scheduled_time    : which fixed time a record is for
-- Run AFTER 251_nursing_procedure_plan.sql. Safe to run more than once.

alter table public.care_orders add column if not exists scheduled_times text[];
alter table public.care_logs   add column if not exists scheduled_time time;

create index if not exists care_logs_order_date_time_idx
  on public.care_logs (care_order_id, care_date, scheduled_time);

notify pgrst, 'reload schema';
