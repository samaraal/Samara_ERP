-- Samara Care ERP v2.14.32
-- CLINICAL ALERTS REPAIR + VITALS TWO-LEVEL ESCALATION
--
-- 1. REPAIR (urgent): since 23-09-2026 ~4:30 PM IST get_current_clinical_alerts() failed with
--    "COALESCE could not convert type time without time zone[] to text[]" because
--    medication_orders.scheduled_times is text[] but was read as time[].
--    Result: no nurse alerts, no escalations, no mobile pushes. Fixed below (text-safe parsing).
--
-- 2. VITALS (per patient vitals_schedule, default 06:00 / 14:00 / 22:00):
--      Nurse alert        at the scheduled time
--      Manager escalation  60 min after the scheduled time  (escalated_to_role = 'Manager')
--      Admin / Director    90 min after the scheduled time  (escalated_to_role = 'Admin')
--    A missed 10 PM slot stays visible after midnight (slots older than 8 hours drop off the
--    live list; their escalation stays in the register until resolved).
--
-- 3. RESCHEDULED DOSES: alerts now also cover doses rescheduled after Missed / Delayed
--    (not only Refused) and re-medication times after midnight (matches ERP 2.14.31).
--
-- Medicines, Daily Care and Physiotherapy keep the existing rule:
--    Managers + Admins together at 30 minutes (escalated_to_role = 'Manager+Admin').
--
-- Safe to run repeatedly.

begin;

create or replace function public.get_current_clinical_alerts()
 returns table(alert_type text, source_id uuid, patient_id uuid, patient_name text, room_label text, title text, description text, due_at timestamp with time zone, overdue_minutes integer, priority text, status text, target_page text, voice_text text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare s public.clinical_alert_settings%rowtype; v_now timestamptz:=now(); v_today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 select * into s from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1;
 return query
 with pb as(
   select p.*,case when p.admission_date=v_today then
     ((p.admission_date+coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata')
     else null end as admission_boundary
   from public.patients p where p.is_active=true and coalesce(p.admission_status,'Active')<>'Discharged'
 ),
 med_regular as(
   select 'Medication'::text,mo.id,mo.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Medicine Due: ',coalesce(mo.medicine_name,'Medicine')),concat(coalesce(mo.strength,''),' · ',coalesce(mo.route,'')),
     ((v_today+t.x) at time zone 'Asia/Kolkata')::timestamptz,
     greatest(0,floor(extract(epoch from(v_now-((v_today+t.x) at time zone 'Asia/Kolkata')))/60))::int,
     case when v_now>((v_today+t.x) at time zone 'Asia/Kolkata')+make_interval(mins=>coalesce(s.medication_error_minutes,60)) then 'Critical'
          when v_now>((v_today+t.x) at time zone 'Asia/Kolkata') then 'Urgent' else 'Routine' end,
     'Active'::text,'Medicines'::text,concat('Attention. Medicine due for ',p.full_name,' in room ',coalesce(p.room_no,''))
   from public.medication_orders mo join pb p on p.id=mo.patient_id
   -- FIX: scheduled_times is text[]; parse each entry safely (works for text[] or time[]).
   cross join lateral (
     select btrim(r)::time as x
     from unnest(coalesce(mo.scheduled_times::text[],array[]::text[])) r
     where btrim(r) ~ '^\d{1,2}:\d{2}(:\d{2})?$'
   ) t
   where mo.is_active=true
     and (p.admission_boundary is null or ((v_today+t.x) at time zone 'Asia/Kolkata')>=p.admission_boundary)
     and ((v_today+t.x) at time zone 'Asia/Kolkata')<=v_now+make_interval(mins=>coalesce(s.medicine_lead_minutes,5))
     and not exists(select 1 from public.medication_administrations ma where ma.order_id=mo.id and ma.scheduled_date=v_today and ma.scheduled_time::time=t.x and ma.status in('Given','Refused','Withheld','Unavailable','Missed','Delayed'))
 ),
 resched as(
   -- Rescheduled doses: after Refused / Missed / Delayed; a time earlier than the original falls on the next day.
   select ma.*,
     case when ma.rescheduled_time>ma.scheduled_time::time then ma.scheduled_date else ma.scheduled_date+1 end as redo_date
   from public.medication_administrations ma
   where ma.rescheduled_time is not null and ma.status in('Refused','Missed','Delayed')
     and ma.scheduled_date>=v_today-1
 ),
 med_rescheduled as(
   select 'Medication'::text,mo.id,mo.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Re-medication Due: ',coalesce(mo.medicine_name,'Medicine')),
     concat('Rescheduled after ',lower(ma.status),' · ',coalesce(ma.reschedule_reason,'')),
     ((ma.redo_date+ma.rescheduled_time) at time zone 'Asia/Kolkata')::timestamptz,
     greatest(0,floor(extract(epoch from(v_now-((ma.redo_date+ma.rescheduled_time) at time zone 'Asia/Kolkata')))/60))::int,
     case when v_now>((ma.redo_date+ma.rescheduled_time) at time zone 'Asia/Kolkata')+make_interval(mins=>coalesce(s.medication_error_minutes,60)) then 'Critical'
          when v_now>((ma.redo_date+ma.rescheduled_time) at time zone 'Asia/Kolkata') then 'Urgent' else 'Routine' end,
     'Active'::text,'Medicines'::text,concat('Re-medication is due for ',p.full_name)
   from resched ma join public.medication_orders mo on mo.id=ma.order_id join pb p on p.id=ma.patient_id
   where ma.redo_date=v_today and mo.is_active=true
     and ((ma.redo_date+ma.rescheduled_time) at time zone 'Asia/Kolkata')<=v_now+make_interval(mins=>coalesce(s.medicine_lead_minutes,5))
     and not exists(select 1 from public.medication_administrations done where done.order_id=ma.order_id and done.scheduled_date=ma.redo_date
       and done.scheduled_time::time=ma.rescheduled_time and done.id<>ma.id and done.status in('Given','Refused','Withheld','Unavailable','Missed','Delayed'))
 ),
 vit_slots as(
   -- Today's and yesterday's vitals times (so a missed 10 PM slot is still shown after midnight).
   select p.id as pid,((d.dt+vt.tm) at time zone 'Asia/Kolkata')::timestamptz as due,vt.tm
   from pb p
   cross join (values (v_today-1),(v_today)) d(dt)
   cross join lateral unnest(coalesce(p.vitals_schedule,array[time '06:00',time '14:00',time '22:00'])) vt(tm)
 ),
 vit as(
   select 'Vital Signs'::text,p.id,p.id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Vital Signs Due: ',to_char(vs.tm,'HH12:MI AM')),'Routine vital observations are pending.'::text,
     vs.due,
     greatest(0,floor(extract(epoch from(v_now-vs.due))/60))::int,
     case when v_now>=vs.due+interval '90 minutes' then 'Critical'
          when v_now>=vs.due+interval '60 minutes' then 'Urgent' else 'Routine' end,
     'Active'::text,'Vital Signs'::text,concat('Vital signs are due for ',p.full_name)
   from vit_slots vs join pb p on p.id=vs.pid
   where v_now>=vs.due and vs.due>v_now-interval '8 hours'
     and (p.admission_boundary is null or vs.due>=p.admission_boundary)
     and not exists(select 1 from public.vital_signs v where v.patient_id=p.id
       and v.recorded_at>=vs.due-interval '90 minutes'
       and v.recorded_at<vs.due+interval '4 hours')
 ),
 shiftdata as(
   select case when (v_now at time zone 'Asia/Kolkata')::time>=time '07:00' and (v_now at time zone 'Asia/Kolkata')::time<time '19:00'
     then 'Day Shift (7 AM–7 PM)' else 'Night Shift (7 PM–7 AM)' end shift_name,
   ((case when (v_now at time zone 'Asia/Kolkata')::time>=time '19:00' then v_today+time '19:00'
          when (v_now at time zone 'Asia/Kolkata')::time>=time '07:00' then v_today+time '07:00'
          else (v_today-1)+time '19:00' end) at time zone 'Asia/Kolkata') shift_start
 ),
 care as(
   select 'Daily Care'::text,c.id,c.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Daily Care Due: ',c.care_type),coalesce(c.instruction,''),
     greatest(sd.shift_start,coalesce(p.admission_boundary,sd.shift_start)),
     greatest(0,floor(extract(epoch from(v_now-greatest(sd.shift_start,coalesce(p.admission_boundary,sd.shift_start))))/60))::int,
     case when v_now>=greatest(sd.shift_start,coalesce(p.admission_boundary,sd.shift_start))+interval '30 minutes' then 'Urgent' else 'Routine' end,
     'Active'::text,'Daily Care'::text,concat('Daily care is due for ',p.full_name)
   from public.care_orders c join pb p on p.id=c.patient_id cross join shiftdata sd
   where c.is_active=true and (c.shift=sd.shift_name or c.shift='Both shifts')
     and not exists(select 1 from public.care_logs l where l.care_order_id=c.id and l.care_date=v_today and l.shift=sd.shift_name and l.status in('Completed','Refused','Not required'))
 ),
 phy as(
   select 'Physiotherapy'::text,pp.id,pp.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Physiotherapy Due: ',pp.therapy_type),coalesce(pp.precautions,''),
     ((v_today+ptx.pt) at time zone 'Asia/Kolkata')::timestamptz,
     greatest(0,floor(extract(epoch from(v_now-((v_today+ptx.pt) at time zone 'Asia/Kolkata')))/60))::int,
     case when v_now>((v_today+ptx.pt) at time zone 'Asia/Kolkata') then 'Urgent' else 'Routine' end,
     'Active'::text,'Physiotherapy'::text,concat('Physiotherapy is due for ',p.full_name)
   from public.physiotherapy_plans pp join pb p on p.id=pp.patient_id
   -- preferred_time is stored as text: parse safely, default 10:00 AM.
   cross join lateral (select case when btrim(coalesce(pp.preferred_time::text,'')) ~* '^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$'
     then btrim(pp.preferred_time::text)::time else time '10:00' end as pt) ptx
   where pp.is_active=true
     and (p.admission_boundary is null or ((v_today+ptx.pt) at time zone 'Asia/Kolkata')>=p.admission_boundary)
     and ((v_today+ptx.pt) at time zone 'Asia/Kolkata')<=v_now+interval '10 minutes'
     and not exists(select 1 from public.physiotherapy_sessions x where (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date=v_today)
 ), allx(a_type,a_source,a_patient,a_name,a_room,a_title,a_desc,a_due,a_overdue,a_priority,a_status,a_page,a_voice) as(
   select * from med_regular union all select * from med_rescheduled union all select * from vit union all select * from care union all select * from phy)
 -- Explicit column names (FIX: the old version referenced a.alert_type, which did not exist in allx).
 select a.a_type,a.a_source,a.a_patient,a.a_name,a.a_room,a.a_title,a.a_desc,a.a_due,a.a_overdue,a.a_priority,a.a_status,a.a_page,a.a_voice
 from allx a where not exists(select 1 from public.clinical_alert_acknowledgements k
   where k.alert_key=concat(a.a_type,':',a.a_source,':',a.a_due) and (k.action='Acknowledged' or (k.action='Snoozed' and k.snoozed_until>v_now)))
 order by case a.a_priority when 'Critical' then 1 when 'Urgent' then 2 else 3 end,a.a_due;
end $function$;

-- Escalation register: vitals Manager at 60 min, Admin/Director at 90 min; all other types unchanged (30 min, both).
create or replace function public.process_clinical_alert_escalations()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  a record;
  s public.clinical_alert_settings%rowtype;
  n int:=0;
  is_vital boolean;
  threshold int;
  level text;
begin
  select * into s from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1;

  for a in select * from public.get_current_clinical_alerts() loop
    if lower(coalesce(a.alert_type,''))='regularisation' then continue; end if;
    is_vital:=lower(coalesce(a.alert_type,''))='vital signs';
    threshold:=case when is_vital then 60 else coalesce(s.manager_escalation_minutes,30) end;
    if a.overdue_minutes<threshold then continue; end if;
    level:=case when not is_vital then 'Manager+Admin'
                when a.overdue_minutes>=90 then 'Admin'
                else 'Manager' end;

    insert into public.clinical_alert_escalations(
      alert_key,patient_id,alert_type,source_id,due_at,priority,escalated_to_role,escalation_reason
    ) values(
      concat(a.alert_type,':',a.source_id,':',a.due_at),
      a.patient_id,a.alert_type,a.source_id,a.due_at,a.priority,level,
      concat(a.title,' overdue by ',a.overdue_minutes,' minutes')
    )
    on conflict(alert_key) do update set
      patient_id=excluded.patient_id,
      alert_type=excluded.alert_type,
      source_id=excluded.source_id,
      due_at=excluded.due_at,
      priority=excluded.priority,
      -- Level only moves up (Manager -> Admin) while the escalation is open.
      escalated_to_role=case
        when public.clinical_alert_escalations.resolved_at is not null then public.clinical_alert_escalations.escalated_to_role
        when excluded.escalated_to_role='Admin' then 'Admin'
        when public.clinical_alert_escalations.escalated_to_role in('Admin','Manager') and excluded.escalated_to_role='Manager' then public.clinical_alert_escalations.escalated_to_role
        else excluded.escalated_to_role end,
      escalation_reason=case
        when public.clinical_alert_escalations.resolved_at is null then excluded.escalation_reason
        else public.clinical_alert_escalations.escalation_reason end;
    n:=n+1;
  end loop;

  return jsonb_build_object('success',true,'processed',n,
    'default_threshold_minutes',coalesce(s.manager_escalation_minutes,30),
    'vitals_manager_minutes',60,'vitals_admin_minutes',90);
end
$$;
grant execute on function public.process_clinical_alert_escalations() to authenticated;

-- Allow the new vitals WhatsApp stages in the delivery log.
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
  check (stage in ('30_MIN','60_MIN','VITALS_60_MANAGER','VITALS_90_ADMIN'));

-- WhatsApp escalation dispatch every minute (the function itself stays silent until the
-- CLINICAL_WHATSAPP_ENABLED secret is set to "true", i.e. after the Meta template is approved).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname='samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; WhatsApp dispatch job not scheduled.';
    return;
  end if;
  new_cmd:=replace(base_cmd,'/functions/v1/clinical-push-dispatch','/functions/v1/clinical-escalation-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname='samara-clinical-whatsapp-dispatch';
  perform cron.schedule('samara-clinical-whatsapp-dispatch','* * * * *',new_cmd);
end $$;

notify pgrst,'reload schema';
commit;
