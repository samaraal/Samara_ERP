-- Samara Care ERP 2.14.74 — Medicine alerts: respect start / stop time and Weekly / Monthly frequency
-- Run once in Supabase > SQL Editor (file 155). Safe to run again (it does nothing the second time).
--
-- Problem: the server alert list (get_current_clinical_alerts) raised "Medicine Due" for every active
-- medicine EVERY DAY, even when
--   * the doctor ordered it to start later (Effective From in the future),
--   * it was stopped at a later time by a doctor review, or had ended (end date passed),
--   * it is a Weekly or Monthly medicine that is not due today.
-- The app screens (MAR, Shift Tasks, Clinical Dashboard) already follow these rules from 2.14.74;
-- this file makes the alerts / escalations follow the same rules.
--
-- What it changes: adds a few conditions to the "regular medicine doses" part of
-- public.get_current_clinical_alerts. Nothing else in the function is touched
-- (vitals, daily care, physiotherapy, re-medication alerts are unchanged).
-- If the function does not look as expected, NOTHING is changed and an error explains why.

-- 1. Helper: is a Weekly / Monthly medicine due on this date? (every other frequency: always true)
create or replace function public.samara_medication_due_on(p_frequency text, p_anchor date, p_day date)
returns boolean
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(p_frequency,''))) not in ('weekly','monthly') or p_anchor is null or p_day is null then true
    when p_day < p_anchor then false
    when lower(btrim(p_frequency)) = 'weekly' then ((p_day - p_anchor) % 7) = 0
    else extract(day from p_day) = least(extract(day from p_anchor),
                                        extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day')))
  end
$$;

-- Columns used below (already present in a normal install; this only guards older databases).
alter table public.medication_orders add column if not exists effective_from timestamptz;
alter table public.medication_orders add column if not exists stopped_at timestamptz;

-- 2. Add the conditions to the regular-dose part of get_current_clinical_alerts.
do $$
declare
  fn oid;
  def text;
  marker constant text := '/* 2.14.74 dose-day filter */';
  pat constant text := 'where mo\.is_active=true(\s+and \(p\.admission_boundary is null or \(\(v_today\+t\.x\))';
  extra constant text :=
    'where mo.is_active=true ' || '/* 2.14.74 dose-day filter */' || E'\n' ||
    '     and (mo.start_date is null or mo.start_date<=v_today)' || E'\n' ||
    '     and (mo.end_date is null or mo.end_date>=v_today)' || E'\n' ||
    '     and (mo.effective_from is null or ((v_today+t.x) at time zone ''Asia/Kolkata'')>=mo.effective_from)' || E'\n' ||
    '     and (mo.stopped_at is null or ((v_today+t.x) at time zone ''Asia/Kolkata'')<mo.stopped_at)' || E'\n' ||
    '     and public.samara_medication_due_on(mo.frequency,coalesce((mo.effective_from at time zone ''Asia/Kolkata'')::date,mo.start_date),v_today)\1';
  hits int;
begin
  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_current_clinical_alerts';
  if fn is null then raise exception 'public.get_current_clinical_alerts was not found — nothing changed.'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_current_clinical_alerts') > 1 then
    raise exception 'More than one get_current_clinical_alerts exists — nothing changed. Send the list to support.';
  end if;

  def := pg_get_functiondef(fn);
  if position(marker in def) > 0 then
    raise notice 'Already updated — nothing to do.';
    return;
  end if;

  select count(*) into hits from regexp_matches(def, pat, 'g');
  if hits <> 1 then
    raise exception 'Expected the regular medicine-dose section once, found % — nothing changed.', hits;
  end if;

  execute regexp_replace(def, pat, extra);  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: medicine alerts now follow start / stop time and Weekly / Monthly days.';
end $$;

-- Check (should return one row containing "2.14.74 dose-day filter"):
select l.line
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace,
lateral regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') as l(line)
where ns.nspname = 'public' and p.proname = 'get_current_clinical_alerts' and l.line ilike '%dose-day filter%';
