-- Samara Care ERP 2.18.93 (follow-up to SQL 280) — remove the last "one physiotherapy session per plan per day" rule.
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- SQL 280 removed the two one-per-day indexes (file 48), but an older constraint from file 36,
-- physiotherapy_sessions_order_date_key = UNIQUE(order_id, session_date), was still there, so the second session of a
-- "Twice daily" plan was refused with "This record already exists".
-- This file drops that constraint and ANY other unique rule on physiotherapy_sessions that is on the date but not on the
-- scheduled time. The new rule (one session per plan, date AND scheduled time, from SQL 280) stays.

begin;

alter table public.physiotherapy_sessions drop constraint if exists physiotherapy_sessions_order_date_key;

do $$
declare r record;
begin
  -- unique / primary-key constraints that include session_date but not scheduled_time
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid='public.physiotherapy_sessions'::regclass and c.contype='u'
      and exists (select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k where a.attname='session_date')
      and not exists (select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k where a.attname='scheduled_time')
  loop
    execute format('alter table public.physiotherapy_sessions drop constraint %I', r.conname);
    raise notice 'Dropped constraint %', r.conname;
  end loop;
  -- stand-alone unique indexes on the date without the scheduled time
  for r in
    select i.indexrelid::regclass::text as idx
    from pg_index i
    where i.indrelid='public.physiotherapy_sessions'::regclass and i.indisunique and not i.indisprimary
      and not exists (select 1 from pg_constraint c where c.conindid=i.indexrelid)
      and pg_get_indexdef(i.indexrelid) ilike '%session_date%'
      and pg_get_indexdef(i.indexrelid) not ilike '%scheduled_time%'
  loop
    execute format('drop index if exists %s', r.idx);
    raise notice 'Dropped index %', r.idx;
  end loop;
end $$;

-- make sure the new per-time rules exist (from SQL 280)
create unique index if not exists physiotherapy_sessions_order_date_time_unique
  on public.physiotherapy_sessions(order_id, session_date, coalesce(scheduled_time, time '00:00')) where order_id is not null;
create unique index if not exists physiotherapy_sessions_plan_date_time_unique
  on public.physiotherapy_sessions(plan_id, session_date, coalesce(scheduled_time, time '00:00')) where plan_id is not null;

commit;
notify pgrst, 'reload schema';

-- Check: the remaining unique rules on physiotherapy_sessions. Every line with session_date must also have scheduled_time.
select indexrelid::regclass as rule, pg_get_indexdef(indexrelid) as definition
from pg_index where indrelid='public.physiotherapy_sessions'::regclass and indisunique
order by 1;
