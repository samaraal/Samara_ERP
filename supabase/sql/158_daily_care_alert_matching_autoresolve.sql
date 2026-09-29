-- Samara Care ERP 2.14.87 — Daily Care alerts: whole-shift timing, optional preferred time, care counted correctly,
-- escalations close by themselves.
-- Run once in Supabase > SQL Editor (file 158). Safe to run again.
--
-- NEW TIMING (decided 29-09-2026). Shifts: Day 7 AM–7 PM, Night 7 PM–7 AM.
--   Care task with NO preferred time (can be given any time in the shift):
--       no alert at 7 AM / 7 PM
--       nurse reminder 2 hours before the shift ends  (5 PM / 5 AM)   — only if not yet recorded
--       Managers + Admins escalation 1 hour before the shift ends (6 PM / 6 AM)
--       WhatsApp "Critical pending" at 6:30 PM / 6:30 AM if still not recorded
--   Care task WITH a preferred time window (e.g. 10:00 AM – 12:00 PM, set on the care plan):
--       nurse reminder at the start of the window (10 AM)
--       Managers + Admins escalation at the end of the window (12 PM); "Critical pending" 30 min later
--       Only "from" given: reminder at that time, escalation 1 hour before shift end.
--       Only "to" given:   reminder 2 hours before it, escalation at that time.
--   A window outside a shift (e.g. 10–12 on a "Both shifts" task, in the night shift) uses the no-time rule there.
--
-- FIXES (Mrs. Kasthuri, 29-09-2026):
--   * care counts when the same patient + same activity is recorded in the CURRENT shift, linked or not
--     (it used the date, so night-shift tasks came back at midnight, and an unlinked entry never counted);
--   * open Daily Care escalations close automatically once the care is recorded in that shift,
--     and past ones whose care was recorded are closed now.
-- Medicines, vitals and physiotherapy are not touched. WhatsApp escalations use the same list.
-- If the function does not look as expected, NOTHING is changed and an error explains why.

begin;

-- Optional preferred time window on each care task.
alter table public.care_orders add column if not exists preferred_from time;
alter table public.care_orders add column if not exists preferred_to time;

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

-- Helper: start of the Samara shift (7 AM / 7 PM IST) that contains a moment.
create or replace function public.samara_shift_start(p timestamptz)
returns timestamptz
language sql
stable
as $$
  select (case
    when (p at time zone 'Asia/Kolkata')::time>=time '19:00' then (p at time zone 'Asia/Kolkata')::date+time '19:00'
    when (p at time zone 'Asia/Kolkata')::time>=time '07:00' then (p at time zone 'Asia/Kolkata')::date+time '07:00'
    else (p at time zone 'Asia/Kolkata')::date-1+time '19:00' end) at time zone 'Asia/Kolkata'
$$;

-- A. Replace the Daily Care part of get_current_clinical_alerts.
do $$
declare
  fn oid;
  def text;
  marker constant text := '/* 2.14.87 daily care timing */';
  old_marker constant text := '/* 2.14.86 care by shift+activity */';
  pat constant text := 'care as\(.*?\n\s*\),\s*\n(\s*)phy as\(';
  repl constant text := $r$care as( /* 2.14.87 daily care timing */
   select 'Daily Care'::text,c.id,c.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Daily Care Due: ',c.care_type),
     concat(case when w.timed then concat('Preferred ',to_char(w.remind_at at time zone 'Asia/Kolkata','HH12:MI AM'),' – ',to_char(w.esc_at at time zone 'Asia/Kolkata','HH12:MI AM'))
                 else 'Any time this shift' end,
            ' · escalates at ',to_char(w.esc_at at time zone 'Asia/Kolkata','HH12:MI AM'),' if not recorded',
            case when btrim(coalesce(c.instruction,''))<>'' then concat(' · ',c.instruction) else '' end),
     w.esc_at-interval '30 minutes',
     greatest(0,floor(extract(epoch from(v_now-(w.esc_at-interval '30 minutes')))/60))::int,
     case when v_now>=w.esc_at then 'Urgent' else 'Routine' end,
     'Active'::text,'Daily Care'::text,concat('Daily care is due for ',p.full_name)
   from public.care_orders c join pb p on p.id=c.patient_id cross join shiftdata sd
   cross join lateral (
     select
       case when c.preferred_from is null then null
            else (c.preferred_from-(sd.shift_start at time zone 'Asia/Kolkata')::time)
                 + case when c.preferred_from<(sd.shift_start at time zone 'Asia/Kolkata')::time then interval '24 hours' else interval '0' end end as f_off,
       case when c.preferred_to is null then null
            else (c.preferred_to-(sd.shift_start at time zone 'Asia/Kolkata')::time)
                 + case when c.preferred_to<=(sd.shift_start at time zone 'Asia/Kolkata')::time then interval '24 hours' else interval '0' end end as t_off
   ) o
   cross join lateral (
     select (o.f_off is not null and o.f_off<interval '12 hours') as f_in,
            (o.t_off is not null and o.t_off<=interval '12 hours' and (o.f_off is null or o.t_off>o.f_off)) as t_in
   ) i
   cross join lateral (
     select x.timed, x.esc_at,
            least(x.esc_at, case when i.f_in then sd.shift_start+o.f_off
                                 when i.t_in then greatest(sd.shift_start, sd.shift_start+o.t_off-interval '2 hours')
                                 else sd.shift_start+interval '10 hours' end) as remind_at
     from (select (i.f_in or i.t_in) as timed,
                  case when i.t_in then sd.shift_start+o.t_off else sd.shift_start+interval '11 hours' end as esc_at) x
   ) w
   where c.is_active=true and (c.shift=sd.shift_name or c.shift='Both shifts')
     and v_now>=w.remind_at
     and (p.admission_boundary is null or p.admission_boundary<w.esc_at-interval '30 minutes')
     and not exists(select 1 from public.care_logs l
       where l.patient_id=c.patient_id and l.shift=sd.shift_name and l.status in('Completed','Refused','Not required')
         and coalesce(l.completed_at,l.created_at)>=sd.shift_start
         and (public.samara_care_activity(split_part(coalesce(l.remarks,''),':',1))=public.samara_care_activity(c.care_type)
              or (l.care_order_id=c.id and btrim(coalesce(l.remarks,''))='')))
 ),
\1phy as($r$;
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
    raise notice 'Daily Care part already updated — nothing to do.';
    return;
  end if;
  if position('shiftdata' in def) = 0 then
    raise exception 'The Daily Care shift section was not found — nothing changed.';
  end if;
  select count(*) into hits from regexp_matches(def, pat, 'g');
  if hits <> 1 then
    raise exception 'Expected the Daily Care section once, found % — nothing changed.', hits;
  end if;
  execute regexp_replace(def, pat, repl);  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: Daily Care whole-shift timing + preferred time window.';
end $$;

-- B1. Close open Daily Care escalations when the care is recorded in that shift.
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
     and public.samara_shift_start(e.due_at)=public.samara_shift_start(v_at)
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
      and public.samara_shift_start(coalesce(l.completed_at,l.created_at))=public.samara_shift_start(e.due_at)
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
       resolution_remarks=concat('Automatically resolved (clean-up 2.14.87): daily care recorded as ',m.status,' at ',
         to_char(m.at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST.'),
       updated_at=now()
  from m
 where t.id=m.id;

notify pgrst,'reload schema';
commit;

-- Check: daily_care_timing_updated should be 1.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_current_clinical_alerts'
      and pg_get_functiondef(p.oid) like '%2.14.87 daily care timing%') as daily_care_timing_updated,
  (select count(*) from public.clinical_alert_escalations where alert_type='Daily Care' and resolved_at is null) as daily_care_still_open;
