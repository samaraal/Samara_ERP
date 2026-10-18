-- Samara Care ERP 2.17.10 — Food & Meals: notifications and escalations, like medicines
-- Run once in Supabase > SQL Editor (file 249). Safe to run again.
--
-- 1. MEAL DUE (Resident Food Intake not recorded) — decided 18-10-2026
--      Breakfast 8:00 AM · Lunch 1:00 PM · Dinner 8:00 PM
--      Nurse notification at the meal time (pop-up, voice, Clinical Alerts)
--      Nursing Manager + Admin / Director escalation 30 minutes later if still not recorded
--      (same register, phone notification and WhatsApp as medicines; "Critical pending" at 60 min)
--      The alert stays on the live list until the next meal (Breakfast till 1 PM, Lunch till 8 PM,
--      Dinner till 7 AM). Any saved entry for that meal (any intake status) closes it, and an open
--      escalation is closed automatically.
--      Not raised for Guests on Tube feeding (their feeds are in the I/O chart), or for a meal time
--      before the Guest was admitted.
-- 2. POOR INTAKE — when a meal is saved as Consumed partially, Tasted only, Refused or Vomited,
--      Nursing Manager + Admin / Director are alerted at once (escalation register, phone, WhatsApp).
--      Closed by the Manager / Admin in Clinical Escalations with remarks, or automatically if the
--      entry is corrected to a better intake.
-- Medicines, vitals, daily care and physiotherapy alerts are not changed.
-- If the alert function does not look as expected, NOTHING is changed and an error explains why.

begin;

-- Meal alerts start from the moment this file is run (meals already missed earlier today are not
-- escalated, so nobody gets a burst of old alerts on the first day).
alter table public.clinical_alert_settings add column if not exists meal_alerts_from timestamptz;
update public.clinical_alert_settings set meal_alerts_from=now() where meal_alerts_from is null;

-- Helpers ------------------------------------------------------------------------------------
create or replace function public.samara_meal_kind(p text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p,'')) like '%lunch%' then 'Lunch'
    when lower(coalesce(p,'')) like '%dinner%' then 'Dinner'
    when lower(coalesce(p,'')) ~ '(breakfast|tiff)' then 'Tiffin'
    else null end
$$;

create or replace function public.samara_meal_label(p text)
returns text language sql immutable as $$
  select case public.samara_meal_kind(p) when 'Tiffin' then 'Breakfast' else coalesce(public.samara_meal_kind(p),'Meal') end
$$;

-- Samara meal times (IST).
create or replace function public.samara_meal_time(p_kind text)
returns time language sql immutable as $$
  select case p_kind when 'Tiffin' then time '08:00' when 'Lunch' then time '13:00' when 'Dinner' then time '20:00' end
$$;

create or replace function public.samara_meal_poor(p text)
returns boolean language sql immutable as $$
  select lower(btrim(coalesce(p,''))) in ('consumed partially','tasted only','refused','vomited')
$$;

-- A. Add the Meal Due and Poor Meal Intake parts to get_current_clinical_alerts ----------------
do $patch$
declare
  def text; updated text;
  marker constant text := '/* 2.17.10 meal alerts */';
  boundary constant text := '), allx(';
  union_old constant text := 'union all select * from phy';
  block text := $cte$), meal_slot as( /* 2.17.10 meal alerts */
   select ((d.dt+m.tm) at time zone 'Asia/Kolkata')::timestamptz as due,d.dt as day,m.kind,m.label,m.live_for
   from (values (v_today-1),(v_today)) d(dt)
   cross join (values ('Tiffin','Breakfast',time '08:00',interval '5 hours'),
                      ('Lunch','Lunch',time '13:00',interval '7 hours'),
                      ('Dinner','Dinner',time '20:00',interval '11 hours')) m(kind,label,tm,live_for)
 ), meal as(
   select 'Meal'::text,p.id,p.id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Meal Due: ',ms.label),
     concat(ms.label,' not yet recorded in Resident Food Intake'),
     ms.due,
     greatest(0,floor(extract(epoch from(v_now-ms.due))/60))::int,
     case when v_now>=ms.due+interval '60 minutes' then 'Critical'
          when v_now>=ms.due+interval '30 minutes' then 'Urgent' else 'Routine' end,
     'Active'::text,'Food & Diet'::text,concat(ms.label,' is due for ',p.full_name)
   from meal_slot ms cross join pb p join public.patients pt on pt.id=p.id
   where v_now>=ms.due and v_now<ms.due+ms.live_for
     and ms.due>=coalesce(s.meal_alerts_from,ms.due)
     and coalesce(pt.diet_plan,'') not ilike '%tube%'
     and (pt.admission_date is null or
          ((pt.admission_date+coalesce(pt.admission_time,(pt.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata')<=ms.due)
     and not exists(select 1 from public.meal_records r where r.patient_id=p.id and r.meal_date=ms.day
                    and public.samara_meal_kind(r.meal_type)=ms.kind)
 ), mealpoor as(
   select 'Meal Intake'::text,r.id,r.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Poor Meal Intake: ',public.samara_meal_label(r.meal_type),' — ',coalesce(r.consumption_status,'')),
     concat_ws(' · ',nullif(btrim(coalesce(r.menu,'')),''),nullif(btrim(coalesce(r.remarks,'')),'')),
     e.due_at,
     greatest(0,floor(extract(epoch from(v_now-e.due_at))/60))::int,
     case when lower(coalesce(r.consumption_status,'')) in ('refused','vomited') then 'Critical' else 'Urgent' end,
     'Active'::text,'Food & Diet'::text,concat('Poor meal intake for ',p.full_name)
   from public.clinical_alert_escalations e
   join public.meal_records r on r.id=e.source_id
   join pb p on p.id=r.patient_id
   where e.alert_type='Meal Intake' and e.resolved_at is null and e.due_at>v_now-interval '24 hours'
 $cte$;
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'Meal alerts already installed — alert function not changed.';
    return;
  end if;
  if (length(def)-length(replace(def,boundary,'')))/length(boundary) <> 1 then
    raise exception 'Alert block boundary "%" not found exactly once — nothing changed.', boundary;
  end if;
  if (length(def)-length(replace(def,union_old,'')))/length(union_old) <> 1 then
    raise exception 'Alert list "%" not found exactly once — nothing changed.', union_old;
  end if;
  updated := replace(def, boundary, block || boundary);
  updated := replace(updated, union_old, union_old || ' union all select * from meal union all select * from mealpoor');
  execute updated;  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: Meal Due + Poor Meal Intake.';
end $patch$;

-- B. Escalation processor: Poor Meal Intake is escalated at once by the trigger below, so the
--    30-minute loop leaves it alone (keeps its own reason text). Meal Due uses the normal 30 min rule.
do $patch$
declare def text;
  line constant text := 'if lower(coalesce(a.alert_type,''''))=''regularisation'' then continue; end if;';
begin
  def := pg_get_functiondef('public.process_clinical_alert_escalations()'::regprocedure);
  if position('2.17.10 meal intake' in def) > 0 then return; end if;
  if position(line in def) = 0 then
    raise notice 'Escalation processor line not found — processor unchanged (poor-intake reason text may be rewritten after 30 min; alerts still work).';
    return;
  end if;
  execute replace(def, line, line || E'\n    if lower(coalesce(a.alert_type,''''))=''meal intake'' then continue; end if; -- 2.17.10 meal intake');
end $patch$;

-- C. Trigger on Resident Food Intake: close Meal Due escalations; raise / close Poor Meal Intake.
create or replace function public.samara_meal_record_alerts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_kind text := public.samara_meal_kind(new.meal_type);
  v_due timestamptz;
  v_by uuid := (select p.id from public.profiles p where p.id=auth.uid() or p.auth_user_id=auth.uid() limit 1);
  v_event timestamptz := coalesce(new.served_at, now());
  v_key text := concat('Meal Intake:',new.id,':',coalesce(new.served_at, now()));
begin
  -- 1. Meal recorded -> close the open Meal Due escalation for that Guest / meal.
  if v_kind is not null and new.meal_date is not null then
    v_due := ((new.meal_date + public.samara_meal_time(v_kind)) at time zone 'Asia/Kolkata');
    update public.clinical_alert_escalations e
       set resolved_at=now(), resolved_by=v_by, resolution_action='Completed',
           resolution_remarks=concat('Automatically resolved: ',public.samara_meal_label(new.meal_type),' recorded as ',
             coalesce(new.consumption_status,'recorded'),' at ',to_char(now() at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST.'),
           updated_at=now()
     where e.alert_type='Meal' and e.resolved_at is null and e.patient_id=new.patient_id and e.due_at=v_due;
  end if;

  -- 2. Poor intake -> alert Nursing Manager + Admin / Director at once (only recent entries).
  if public.samara_meal_poor(new.consumption_status)
     and coalesce(new.meal_date, current_date) >= ((now() at time zone 'Asia/Kolkata')::date - 1) then
    if tg_op='INSERT' or not public.samara_meal_poor(old.consumption_status) then
      update public.clinical_alert_escalations
         set resolved_at=null, resolved_by=null, resolution_action=null, resolution_remarks=null, updated_at=now()
       where alert_type='Meal Intake' and source_id=new.id and resolution_action='Intake corrected';
      if not found then
        insert into public.clinical_alert_escalations(
          alert_key,patient_id,alert_type,source_id,due_at,priority,escalated_to_role,escalation_reason)
        values(v_key,new.patient_id,'Meal Intake',new.id,v_event,
          case when lower(coalesce(new.consumption_status,'')) in ('refused','vomited') then 'Critical' else 'Urgent' end,
          'Manager+Admin',
          concat(public.samara_meal_label(new.meal_type),' — ',new.consumption_status,
                 case when btrim(coalesce(new.menu,''))<>'' then concat(' (',new.menu,')') else '' end))
        on conflict (alert_key) do nothing;
      end if;
    end if;
  elsif tg_op='UPDATE' and public.samara_meal_poor(old.consumption_status) then
    -- Entry corrected to a better intake -> close the poor-intake alert.
    update public.clinical_alert_escalations
       set resolved_at=now(), resolved_by=v_by, resolution_action='Intake corrected',
           resolution_remarks=concat('Automatically closed: intake corrected to ',coalesce(new.consumption_status,'—'),'.'),
           updated_at=now()
     where alert_type='Meal Intake' and source_id=new.id and resolved_at is null;
  end if;
  return new;
end $$;
revoke all on function public.samara_meal_record_alerts() from public, anon, authenticated;

drop trigger if exists samara_meal_record_alerts on public.meal_records;
create trigger samara_meal_record_alerts
after insert or update of consumption_status, meal_type, meal_date on public.meal_records
for each row execute function public.samara_meal_record_alerts();

-- D. WhatsApp delivery log: allow the immediate poor-intake stage.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.clinical_whatsapp_escalations'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%stage%' loop
    execute format('alter table public.clinical_whatsapp_escalations drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.clinical_whatsapp_escalations
  add constraint clinical_whatsapp_escalations_stage_check
  check (stage in ('30_MIN','60_MIN','VITALS_60_MANAGER','VITALS_90_ADMIN','MEAL_INTAKE_NOW'));

commit;
notify pgrst,'reload schema';

-- Check: both should be true; escalation_minutes should be 30.
select
  strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'2.17.10 meal alerts')>0 as meal_alerts_ready,
  exists(select 1 from pg_trigger where tgname='samara_meal_record_alerts') as meal_trigger_ready,
  (select manager_escalation_minutes from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1) as escalation_minutes;
