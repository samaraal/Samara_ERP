-- Samara Care ERP 2.18.93 — Physiotherapy: Twice / Thrice daily plans can record each session (23-10-2026)
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- Problem: Mr. Ranjithkumar's plan is "Twice daily", but the database allowed only ONE session per plan per day
-- (unique index on plan + date, file 48). The second session of 23-10-2026 was refused with
-- "A session exists for this date".
-- Fix: one session per plan per date AND scheduled time. The ERP limits the number of sessions per day by the plan's
-- frequency (Daily = 1, Twice daily = 2, Thrice daily = 3) and asks for a different Scheduled Time for each one.
-- Each session is billed and counted separately, exactly as a single session is today. Nothing else is changed.

begin;

drop index if exists public.physiotherapy_sessions_order_date_unique;
drop index if exists public.physiotherapy_sessions_plan_date_unique;

create unique index if not exists physiotherapy_sessions_order_date_time_unique
  on public.physiotherapy_sessions(order_id, session_date, coalesce(scheduled_time, time '00:00'))
  where order_id is not null;
create unique index if not exists physiotherapy_sessions_plan_date_time_unique
  on public.physiotherapy_sessions(plan_id, session_date, coalesce(scheduled_time, time '00:00'))
  where plan_id is not null;

commit;
notify pgrst, 'reload schema';

-- Check: both should be true, the old one-per-day rules false.
select
  to_regclass('public.physiotherapy_sessions_plan_date_time_unique') is not null as per_time_rule_ready,
  to_regclass('public.physiotherapy_sessions_order_date_time_unique') is not null as per_time_rule_ready_2,
  to_regclass('public.physiotherapy_sessions_plan_date_unique') is not null as old_one_per_day_rule_still_there;
