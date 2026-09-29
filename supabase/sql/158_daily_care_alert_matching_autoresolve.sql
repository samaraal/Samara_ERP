-- Samara Care ERP 2.14.86 — Daily Care alerts: count care that was really given, and close escalations automatically
-- Run once in Supabase > SQL Editor (file 158). Safe to run again.
--
-- Problems found (29-09-2026, Mrs. Kasthuri, Room 109-C):
--  1. A Daily Care entry made from the Daily Care page (not from an alert / Shift Task) is saved with no
--     link to the care order, so the alert never cleared (e.g. Bathing assistance 06:26 AM, 29-09-2026).
--  2. The alert matched care by DATE instead of by SHIFT. A night shift runs across midnight, so
--       * at 12:00 midnight every night-shift care task came back as "due since 7 PM" and escalated at once;
--       * between 7 PM and midnight, the previous morning's night entry wrongly counted as done.
--  3. Daily Care escalations never closed after the care was recorded, so the register filled up with
--     "Open" items that were in fact done.
--
-- What this file changes:
--  A. In public.get_current_clinical_alerts only the Daily Care check is replaced: a care task counts as done
--     when the same patient has a Completed / Refused / Not required entry for the SAME activity in the
--     CURRENT shift (from the shift's start time), whether or not the entry was linked to the order.
--     Medicines, vitals and physiotherapy are not touched. WhatsApp escalations use this same list.
--  B. A trigger on care_logs closes open Daily Care escalations for that patient + activity as soon as the
--     care is recorded, and a one-time clean-up closes past escalations whose care was recorded in that shift.
-- If the function does not look as expected, NOTHING is changed and an error explains why.

begin;

-- Helper: one spelling for each care activity (old names and small differences match the new list).
create or replace function public.samara_care_activity(p text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p,'')))
    when 'restroom assistance' then 'restroom/toileting assistance'
    when 'mobility assistance' then 'walking/mobility assistance'
    when 'position change' then 'position change / bedsore prevention'
    when 'fluid monitoring' then 'fluid intake monitoring'
    else lower(btrim(coalesce(p,'')))
  end
$$;

-- A. Replace the Daily Care "already done?" check.
do $$
declare
  fn oid;
  def text;
  marker constant text := '/* 2.14.86 care by shift+activity */';
  pat constant text := $p$not exists\(select 1 from public\.care_logs l where l\.care_order_id=c\.id and l\.care_date=v_today and l\.shift=sd\.shift_name and l\.status in\('Completed','Refused','Not required'\)\)$p$;
  repl constant text := $r$not exists(select 1 from public.care_logs l /* 2.14.86 care by shift+activity */ where l.patient_id=c.patient_id and l.shift=sd.shift_name and l.status in('Completed','Refused','Not required') and coalesce(l.completed_at,l.created_at)>=sd.shift_start and (public.samara_care_activity(split_part(coalesce(l.remarks,''),':',1))=public.samara_care_activity(c.care_type) or (l.care_order_id=c.id and btrim(coalesce(l.remarks,''))='')))$r$;
  hits int;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_current_clinical_alerts') <> 1 then
    raise exception 'Expected exactly one public.get_current_clinical_alerts — nothing changed.';
  end if;
  select p.oid into fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_current_clinical_alerts';

  def := pg_get_functiondef(fn);
  if position(marker in def) > 0 then
    raise notice 'Daily Care check already updated — nothing to do.';
    return;
  end if;
  select count(*) into hits from regexp_matches(def, pat, 'g');
  if hits <> 1 then
    raise exception 'Expected the Daily Care check once, found % — nothing changed.', hits;
  end if;
  execute regexp_replace(def, pat, repl);  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: Daily Care now matched by shift + activity.';
end $$;

-- B1. Close open Daily Care escalations when the care is recorded.
create or replace function public.samara_resolve_daily_care_escalations()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_at timestamptz := coalesce(new.completed_at,new.created_at,now());
  v_activity text := public.samara_care_activity(split_part(coalesce(new.remarks,''),':',1));
begin
  if new.status not in ('Completed','Refused','Not required') then return new; end if;
  update public.clinical_alert_escalations e
     set resolved_at=now(),
         resolution_action='Completed',
         resolution_remarks=concat('Automatically resolved: daily care recorded as ',new.status,' at ',
           to_char(v_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST.'),
         updated_at=now()
   where e.resolved_at is null
     and e.alert_type='Daily Care'
     and e.patient_id=new.patient_id
     and e.due_at<=v_at and v_at<e.due_at+interval '12 hours'
     and exists(select 1 from public.care_orders c where c.id=e.source_id
                and (public.samara_care_activity(c.care_type)=v_activity
                     or (c.id=new.care_order_id and v_activity='')));
  return new;
end $$;

drop trigger if exists samara_care_logs_resolve_escalations on public.care_logs;
create trigger samara_care_logs_resolve_escalations
after insert or update of status on public.care_logs
for each row execute function public.samara_resolve_daily_care_escalations();

-- B2. One-time clean-up: close past Daily Care escalations whose care was recorded in that shift.
with m as (
  select e.id, x.status, x.at
  from public.clinical_alert_escalations e
  cross join lateral (
    select l.status, coalesce(l.completed_at,l.created_at) as at
    from public.care_orders c
    join public.care_logs l on l.patient_id=c.patient_id
    where c.id=e.source_id
      and l.status in ('Completed','Refused','Not required')
      and coalesce(l.completed_at,l.created_at)>=e.due_at
      and coalesce(l.completed_at,l.created_at)<e.due_at+interval '12 hours'
      and (public.samara_care_activity(split_part(coalesce(l.remarks,''),':',1))=public.samara_care_activity(c.care_type)
           or (l.care_order_id=c.id and btrim(coalesce(l.remarks,''))=''))
    order by coalesce(l.completed_at,l.created_at)
    limit 1
  ) x
  where e.resolved_at is null and e.alert_type='Daily Care'
)
update public.clinical_alert_escalations t
   set resolved_at=now(),
       resolution_action='Completed',
       resolution_remarks=concat('Automatically resolved (clean-up 2.14.86): daily care recorded as ',m.status,' at ',
         to_char(m.at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST.'),
       updated_at=now()
  from m
 where t.id=m.id;

notify pgrst,'reload schema';
commit;

-- Check: should return 1 (the new Daily Care check is in place) and show how many Daily Care escalations are still open.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_current_clinical_alerts'
      and pg_get_functiondef(p.oid) like '%2.14.86 care by shift+activity%') as daily_care_check_updated,
  (select count(*) from public.clinical_alert_escalations where alert_type='Daily Care' and resolved_at is null) as daily_care_still_open;
