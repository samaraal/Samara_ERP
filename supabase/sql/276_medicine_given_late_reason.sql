-- Samara Care ERP 2.18.85 — Medicine GIVEN late: reason compulsory + Nursing Manager informed (decided 23-10-2026)
-- Run once in Supabase > SQL Editor AFTER file 249 (meal alerts). Safe to run again.
--
-- 1. Two new MAR fields: late_given_reason (e.g. Guest asleep, Medicine not available) and late_given_details.
--    The ERP asks for them whenever a dose is saved as Given 30 minutes or more after its scheduled time
--    (also when a nurse corrects the "given at" time of today's dose to a late time).
-- 2. When such a dose is saved, the Nursing Manager (Manager role) is informed at once — ERP pop-up / voice,
--    Clinical Alerts and the Clinical Escalations register (type "Medicine Late"), like Poor Meal Intake.
--    The Manager closes it in Clinical Escalations with remarks. It drops off the live list after 24 hours.
--    It is NOT sent on WhatsApp and does not go to Admin / Director screens (they still see it in the register).
-- Nothing else is changed. If the alert function does not look as expected, NOTHING is changed.

begin;

alter table public.medication_administrations add column if not exists late_given_reason text;
alter table public.medication_administrations add column if not exists late_given_details text;
comment on column public.medication_administrations.late_given_reason is 'Why a dose was GIVEN 30+ minutes after its scheduled time (not the same as late_entry = recorded late)';

-- Minutes between the scheduled dose time (IST) and the actual "given at" time.
create or replace function public.samara_med_given_late_minutes(p_date date, p_time time, p_given timestamptz)
returns int language sql immutable as $$
  select case when p_date is null or p_time is null or p_given is null then null
    else floor(extract(epoch from (p_given - ((p_date + p_time) at time zone 'Asia/Kolkata')))/60)::int end
$$;

-- A. Trigger: a late-given dose with a reason -> inform the Nursing Manager (escalation register).
create or replace function public.samara_med_given_late_alert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_late int := public.samara_med_given_late_minutes(new.scheduled_date, new.scheduled_time::time, new.administered_at);
  v_med text;
  v_key text := concat('Medicine Late:',new.id);
begin
  if new.status <> 'Given' or coalesce(btrim(new.late_given_reason),'') = '' or coalesce(v_late,0) < 30 then
    -- corrected to on time / not given -> close an open "Medicine Late" alert for this dose
    update public.clinical_alert_escalations
       set resolved_at=now(), resolution_action='Corrected',
           resolution_remarks='Automatically closed: the dose is no longer recorded as given late.'
     where alert_type='Medicine Late' and source_id=new.id and resolved_at is null;
    return new;
  end if;
  if tg_op='UPDATE' and old.status='Given' and coalesce(btrim(old.late_given_reason),'')<>''
     and old.administered_at is not distinct from new.administered_at
     and old.late_given_reason is not distinct from new.late_given_reason then
    return new; -- nothing relevant changed
  end if;
  select concat_ws(' ',mo.medicine_name,nullif(btrim(coalesce(mo.strength,'')),'')) into v_med
    from public.medication_orders mo where mo.id=new.order_id;
  insert into public.clinical_alert_escalations(alert_key,patient_id,alert_type,source_id,due_at,priority,escalated_to_role,escalation_reason)
  values(v_key,new.patient_id,'Medicine Late',new.id,now(),'Urgent','Manager',
    concat(coalesce(v_med,'Medicine'),' given ',
      case when v_late>=60 then concat(v_late/60,' h ',v_late%60,' min') else concat(v_late,' min') end,
      ' late (scheduled ',to_char(new.scheduled_time::time,'HH12:MI AM'),') — ',new.late_given_reason,
      case when coalesce(btrim(new.late_given_details),'')<>'' then concat(': ',new.late_given_details) else '' end))
  on conflict (alert_key) do update
    set resolved_at=null, resolution_action=null, resolution_remarks=null,
        due_at=excluded.due_at, escalation_reason=excluded.escalation_reason;
  return new;
end $$;
revoke all on function public.samara_med_given_late_alert() from public, anon, authenticated;

drop trigger if exists samara_med_given_late_alert on public.medication_administrations;
create trigger samara_med_given_late_alert
after insert or update of status, administered_at, late_given_reason, late_given_details on public.medication_administrations
for each row execute function public.samara_med_given_late_alert();

-- B. Show open "Medicine Late" items on the live alert list (overdue 0 -> no 30/60-min WhatsApp stages).
do $patch$
declare
  def text; updated text;
  marker constant text := '/* 2.18.85 medicine late */';
  boundary constant text := '), allx(';
  union_old constant text := 'union all select * from mealpoor';
  block text := $cte$), medlate as( /* 2.18.85 medicine late */
   select 'Medicine Late'::text,ma.id,ma.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Medicine Given Late: ',coalesce(mo.medicine_name,'Medicine')),
     e.escalation_reason,
     e.due_at,
     0,
     'Urgent'::text,
     'Active'::text,'Medicines'::text,concat('Medicine given late for ',p.full_name,'. Please review.')
   from public.clinical_alert_escalations e
   join public.medication_administrations ma on ma.id=e.source_id
   left join public.medication_orders mo on mo.id=ma.order_id
   join pb p on p.id=ma.patient_id
   where e.alert_type='Medicine Late' and e.resolved_at is null and e.due_at>v_now-interval '24 hours'
 $cte$;
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'Medicine Late alerts already installed — alert function not changed.';
    return;
  end if;
  if (length(def)-length(replace(def,boundary,'')))/length(boundary) <> 1 then
    raise exception 'Alert block boundary "%" not found exactly once — nothing changed.', boundary;
  end if;
  if (length(def)-length(replace(def,union_old,'')))/length(union_old) <> 1 then
    raise exception 'Alert list "%" not found exactly once (run file 249 first) — nothing changed.', union_old;
  end if;
  updated := replace(def, boundary, block || boundary);
  updated := replace(updated, union_old, union_old || ' union all select * from medlate');
  execute updated;
  raise notice 'get_current_clinical_alerts updated: Medicine Given Late.';
end $patch$;

commit;
notify pgrst,'reload schema';

-- Check: all should be true.
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_administrations' and column_name='late_given_reason') as late_reason_column_ready,
  exists(select 1 from pg_trigger where tgname='samara_med_given_late_alert') as late_alert_trigger_ready,
  strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'2.18.85 medicine late')>0 as late_alert_list_ready;
