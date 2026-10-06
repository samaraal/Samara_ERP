-- Samara Care ERP 2.15.75 (SQL 199)
-- Daily room rent / nursing charges: India date + automatic posting at 12:05 AM IST
--
-- Problem fixed:
--   1. run_daily_billing_automation() compared the charge date with the database's
--      current_date, which is UTC. From 12:00 AM to 5:30 AM IST the database still
--      thought it was "yesterday", so today's rent was rejected as a "future charge"
--      (the login trigger only logged a silent browser warning).
--   2. Rent posted only when a staff member logged in (or the payable WhatsApp ran).
--
-- This file:
--   A. Changes that one check to the India (Asia/Kolkata) date. Nothing else in the
--      billing function is touched (departure, package, tariff-history logic kept).
--   B. Adds run_daily_billing_cron(): runs the same duplicate-safe billing for
--      today's India date as the system (service role). Not callable by app users.
--   C. Schedules it with pg_cron at 12:05 AM IST, plus a 6:05 AM IST safety re-run.
--      The login trigger stays as a backup. All runs are duplicate-safe.
--
-- Run the whole file once in Supabase SQL Editor. Safe to run again.

begin;

-- A. India-date check inside the existing billing function ---------------------
do $patch$
declare s text; n integer;
begin
  s := pg_get_functiondef('public.run_daily_billing_automation(date,boolean)'::regprocedure);
  if position('-- IST_DATE_CHECK_V1' in s) > 0 then
    raise notice 'IST date check already installed.';
    return;
  end if;
  n := (select count(*) from regexp_matches(s, 'p_charge_date\s*>\s*current_date', 'gi'));
  if n <> 1 then
    raise exception 'Unexpected future-date check in run_daily_billing_automation (found %); review migration 199.', n;
  end if;
  s := regexp_replace(s, 'p_charge_date\s*>\s*current_date',
         '/* -- IST_DATE_CHECK_V1 */ p_charge_date > (now() at time zone ''Asia/Kolkata'')::date', 'i');
  execute s;
end $patch$;

-- B. System runner for the scheduler ------------------------------------------
create or replace function public.run_daily_billing_cron()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  -- Run as the system (service role), same as the payable WhatsApp function does.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.run_daily_billing_automation(v_today, false);
  return v_result;
end $$;

revoke all on function public.run_daily_billing_cron() from public;
revoke all on function public.run_daily_billing_cron() from anon, authenticated;

-- C. Schedule (pg_cron runs in UTC: 18:35 UTC = 12:05 AM IST, 00:35 UTC = 6:05 AM IST)
do $$
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname in ('samara-daily-room-rent', 'samara-daily-room-rent-recheck');
  perform cron.schedule('samara-daily-room-rent',         '35 18 * * *', 'select public.run_daily_billing_cron();');
  perform cron.schedule('samara-daily-room-rent-recheck', '35 0 * * *',  'select public.run_daily_billing_cron();');
end $$;

notify pgrst, 'reload schema';
commit;

-- Checks -----------------------------------------------------------------------
-- 1. Both jobs scheduled:
select jobname, schedule, active from cron.job where jobname like 'samara-daily-room-rent%';
-- 2. Function now uses India date (should return true):
select position('IST_DATE_CHECK_V1' in pg_get_functiondef('public.run_daily_billing_automation(date,boolean)'::regprocedure)) > 0 as ist_check_installed;
-- 3. Optional: post today's rent now (duplicate-safe) and see the result:
-- select public.run_daily_billing_cron();
-- 4. After 12:05 AM, see the run history (times shown in IST):
-- select charge_date, run_type, status, room_charges_created,
--        to_char(started_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') started_ist
--   from public.daily_billing_runs order by started_at desc limit 5;
