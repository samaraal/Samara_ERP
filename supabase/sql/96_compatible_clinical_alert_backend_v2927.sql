-- Samara Care ERP v2.9.27
-- COMPATIBLE CLINICAL ALERT + ESCALATION BACKEND
-- Purpose:
--   Restore current alerts across mixed/legacy Samara schemas and preserve
--   the 30-minute escalation workflow.
--
-- Important compatibility choices:
--   * medication_orders.scheduled_times is read through to_jsonb(), so both
--     legacy time[] and newer text[] storage are supported.
--   * medicine_name / medicine, care_type / activity, instruction / instructions
--     are read without hard-referencing a possibly-missing legacy column.
--   * care_logs supports either care_date or recorded_at based records.
--   * Vitals and Daily Care due_at are the active 7 AM / 7 PM shift start.
--
-- Safe to run repeatedly.

begin;

insert into public.clinical_alert_settings(setting_key)
values ('global')
on conflict(setting_key) do nothing;

alter table public.clinical_alert_escalations
  add column if not exists source_id uuid,
  add column if not exists due_at timestamptz,
  add column if not exists resolution_action text,
  add column if not exists resolution_remarks text,
  add column if not exists resolved_by uuid;

create index if not exists idx_clinical_alert_escalations_open
  on public.clinical_alert_escalations(resolved_at,patient_id,alert_type);
create index if not exists idx_clinical_alert_escalations_source
  on public.clinical_alert_escalations(source_id);

create or replace function public.get_current_clinical_alerts()
returns table(
  alert_type text,
  source_id uuid,
  patient_id uuid,
  patient_name text,
  room_label text,
  title text,
  description text,
  due_at timestamptz,
  overdue_minutes int,
  priority text,
  status text,
  target_page text,
  voice_text text
)
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.clinical_alert_settings%rowtype;
  v_now_ist timestamp without time zone := now() at time zone 'Asia/Kolkata';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_shift text;
  v_shift_start_local timestamp without time zone;
  v_shift_start timestamptz;
begin
  select * into s
  from public.clinical_alert_settings
  where is_active=true
  order by updated_at desc
  limit 1;

  if not found then
    select * into s
    from public.clinical_alert_settings
    order by updated_at desc
    limit 1;
  end if;

  if v_now_ist::time >= time '07:00' and v_now_ist::time < time '19:00' then
    v_shift := 'Day Shift (7 AM–7 PM)';
    v_shift_start_local := v_today + time '07:00';
  elsif v_now_ist::time >= time '19:00' then
    v_shift := 'Night Shift (7 PM–7 AM)';
    v_shift_start_local := v_today + time '19:00';
  else
    v_shift := 'Night Shift (7 PM–7 AM)';
    v_shift_start_local := (v_today - 1) + time '19:00';
  end if;

  v_shift_start := v_shift_start_local at time zone 'Asia/Kolkata';

  return query
  with pb as (
    select p.id,p.full_name,p.room_no,p.bed_no
    from public.patients p
    where coalesce(p.is_active,true)=true
  ),

  /* Parse scheduled_times safely from either text[] or time[] using JSON. */
  medication_schedule as (
    select
      mo.id,
      mo.patient_id,
      trim(both '"' from j.value::text) as raw_time,
      case
        when trim(both '"' from j.value::text) ~* '^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$'
        then trim(both '"' from j.value::text)::time
        else null::time
      end as scheduled_time,
      coalesce(
        nullif(to_jsonb(mo)->>'medicine_name',''),
        nullif(to_jsonb(mo)->>'medicine',''),
        'Medicine'
      ) as medicine_name,
      coalesce(nullif(to_jsonb(mo)->>'strength',''),'') as strength,
      coalesce(nullif(to_jsonb(mo)->>'route',''),'') as route
    from public.medication_orders mo
    cross join lateral jsonb_array_elements(
      coalesce(to_jsonb(mo)->'scheduled_times','[]'::jsonb)
    ) j(value)
    where coalesce((to_jsonb(mo)->>'is_active')::boolean,true)=true
  ),

  med as (
    select
      'Medication'::text as alert_type,
      ms.id as source_id,
      ms.patient_id,
      p.full_name as patient_name,
      concat(
        'Room ',coalesce(p.room_no,'—'),
        case when p.bed_no is not null and btrim(p.bed_no)<>'' then '-'||p.bed_no else '' end
      )::text as room_label,
      concat('Medicine Due: ',ms.medicine_name)::text as title,
      concat_ws(' · ',nullif(ms.strength,''),nullif(ms.route,''))::text as description,
      ((v_today + ms.scheduled_time) at time zone 'Asia/Kolkata')::timestamptz as due_at,
      greatest(
        0,
        floor(extract(epoch from(
          now() - ((v_today + ms.scheduled_time) at time zone 'Asia/Kolkata')
        ))/60)
      )::int as overdue_minutes,
      case
        when now() > ((v_today + ms.scheduled_time) at time zone 'Asia/Kolkata')
                     + make_interval(mins=>coalesce(s.medication_error_minutes,60))
          then 'Critical'
        when now() > ((v_today + ms.scheduled_time) at time zone 'Asia/Kolkata')
          then 'Urgent'
        else 'Routine'
      end::text as priority,
      'Active'::text as status,
      'Medicines'::text as target_page,
      concat(
        'Attention. Medicine due for ',p.full_name,
        ' in room ',coalesce(p.room_no,'')
      )::text as voice_text
    from medication_schedule ms
    join pb p on p.id=ms.patient_id
    where ms.scheduled_time is not null
      and ((v_today + ms.scheduled_time) at time zone 'Asia/Kolkata')
          <= now()+make_interval(mins=>coalesce(s.medicine_lead_minutes,5))
      and not exists (
        select 1
        from public.medication_administrations ma
        where
          coalesce(
            nullif(to_jsonb(ma)->>'order_id','')::uuid,
            nullif(to_jsonb(ma)->>'medication_order_id','')::uuid
          )=ms.id
          and coalesce(
            nullif(to_jsonb(ma)->>'scheduled_date','')::date,
            v_today
          )=v_today
          and (
            coalesce(nullif(to_jsonb(ma)->>'scheduled_time',''),'')=ms.raw_time
            or
            (
              nullif(to_jsonb(ma)->>'scheduled_time','') is not null
              and nullif(to_jsonb(ma)->>'scheduled_time','')::time=ms.scheduled_time
            )
          )
          and coalesce(to_jsonb(ma)->>'status','') in
              ('Given','Refused','Withheld','Unavailable','Missed')
      )
  ),

  /* One Vitals alert per active patient for the current 12-hour shift. */
  vit as (
    select
      'Vital Signs'::text,
      p.id,
      p.id,
      p.full_name,
      concat(
        'Room ',coalesce(p.room_no,'—'),
        case when p.bed_no is not null and btrim(p.bed_no)<>'' then '-'||p.bed_no else '' end
      )::text,
      'Vital Signs Due'::text,
      'Routine vital observations are pending.'::text,
      v_shift_start,
      greatest(0,floor(extract(epoch from(now()-v_shift_start))/60))::int,
      case
        when now() >= v_shift_start+make_interval(mins=>coalesce(s.manager_escalation_minutes,30))
          then 'Urgent'
        else 'Routine'
      end::text,
      'Active'::text,
      'Vital Signs'::text,
      concat('Vital signs are due for ',p.full_name)::text
    from pb p
    where now()>=v_shift_start
      and not exists (
        select 1
        from public.vital_signs v
        where v.patient_id=p.id
          and v.recorded_at>=v_shift_start
          and v.recorded_at<v_shift_start+interval '12 hours'
      )
  ),

  /* Daily Care: tolerate old/new care_orders and care_logs field names. */
  care_base as (
    select
      c.id,
      c.patient_id,
      coalesce(
        nullif(to_jsonb(c)->>'care_type',''),
        nullif(to_jsonb(c)->>'activity',''),
        'Daily Care'
      ) as care_name,
      coalesce(
        nullif(to_jsonb(c)->>'instruction',''),
        nullif(to_jsonb(c)->>'instructions',''),
        ''
      ) as care_instruction,
      coalesce(nullif(to_jsonb(c)->>'shift',''),'Both shifts') as care_shift
    from public.care_orders c
    where coalesce((to_jsonb(c)->>'is_active')::boolean,true)=true
  ),

  care as (
    select
      'Daily Care'::text,
      c.id,
      c.patient_id,
      p.full_name,
      concat(
        'Room ',coalesce(p.room_no,'—'),
        case when p.bed_no is not null and btrim(p.bed_no)<>'' then '-'||p.bed_no else '' end
      )::text,
      concat('Daily Care Due: ',c.care_name)::text,
      c.care_instruction::text,
      v_shift_start,
      greatest(0,floor(extract(epoch from(now()-v_shift_start))/60))::int,
      case
        when now() >= v_shift_start+make_interval(mins=>coalesce(s.manager_escalation_minutes,30))
          then 'Urgent'
        else 'Routine'
      end::text,
      'Active'::text,
      'Daily Care'::text,
      concat('Daily care is due for ',p.full_name)::text
    from care_base c
    join pb p on p.id=c.patient_id
    where
      (
        lower(c.care_shift)=lower(v_shift)
        or lower(c.care_shift) in ('both shifts','both shift','both')
      )
      and now()>=v_shift_start
      and not exists (
        select 1
        from public.care_logs l
        where
          (
            nullif(to_jsonb(l)->>'care_order_id','')::uuid=c.id
            or (
              nullif(to_jsonb(l)->>'care_order_id','') is null
              and nullif(to_jsonb(l)->>'patient_id','')::uuid=c.patient_id
            )
          )
          and coalesce(
            nullif(to_jsonb(l)->>'care_date','')::date,
            ((nullif(to_jsonb(l)->>'recorded_at',''))::timestamptz at time zone 'Asia/Kolkata')::date,
            ((nullif(to_jsonb(l)->>'completed_at',''))::timestamptz at time zone 'Asia/Kolkata')::date
          )=v_shift_start_local::date
          and (
            nullif(to_jsonb(l)->>'shift','') is null
            or to_jsonb(l)->>'shift'=v_shift
          )
          and coalesce(to_jsonb(l)->>'status','') in
              ('Completed','Refused','Not required')
      )
  ),

  /* Physiotherapy is kept schema-tolerant where practical. */
  phy_base as (
    select
      pp.id,
      pp.patient_id,
      coalesce(nullif(to_jsonb(pp)->>'therapy_type',''),'Physiotherapy') as therapy_type,
      coalesce(nullif(to_jsonb(pp)->>'precautions',''),'') as precautions,
      case
        when coalesce(nullif(to_jsonb(pp)->>'preferred_time',''),'')=''
          then time '10:00'
        when (to_jsonb(pp)->>'preferred_time') ~* '^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$'
          then (to_jsonb(pp)->>'preferred_time')::time
        else time '10:00'
      end as preferred_time
    from public.physiotherapy_plans pp
    where coalesce((to_jsonb(pp)->>'is_active')::boolean,true)=true
  ),

  phy as (
    select
      'Physiotherapy'::text,
      pp.id,
      pp.patient_id,
      p.full_name,
      concat(
        'Room ',coalesce(p.room_no,'—'),
        case when p.bed_no is not null and btrim(p.bed_no)<>'' then '-'||p.bed_no else '' end
      )::text,
      concat('Physiotherapy Due: ',pp.therapy_type)::text,
      pp.precautions::text,
      ((v_today+pp.preferred_time) at time zone 'Asia/Kolkata')::timestamptz,
      greatest(
        0,
        floor(extract(epoch from(
          now()-((v_today+pp.preferred_time) at time zone 'Asia/Kolkata')
        ))/60)
      )::int,
      case
        when now()>((v_today+pp.preferred_time) at time zone 'Asia/Kolkata')
          then 'Urgent'
        else 'Routine'
      end::text,
      'Active'::text,
      'Physiotherapy'::text,
      concat('Physiotherapy is due for ',p.full_name)::text
    from phy_base pp
    join pb p on p.id=pp.patient_id
    where ((v_today+pp.preferred_time) at time zone 'Asia/Kolkata')
            <=now()+interval '10 minutes'
      and not exists (
        select 1
        from public.physiotherapy_sessions x
        where (
          nullif(to_jsonb(x)->>'plan_id','')::uuid=pp.id
          or nullif(to_jsonb(x)->>'order_id','')::uuid=pp.id
        )
        and coalesce(
          nullif(to_jsonb(x)->>'session_date','')::date,
          ((nullif(to_jsonb(x)->>'created_at',''))::timestamptz at time zone 'Asia/Kolkata')::date
        )=v_today
      )
  ),

  allx as (
    select * from med
    union all select * from vit
    union all select * from care
    union all select * from phy
  )

  select a.*
  from allx a
  where not exists (
    select 1
    from public.clinical_alert_acknowledgements k
    where k.alert_key=concat(a.alert_type,':',a.source_id,':',a.due_at)
      and (
        k.action='Acknowledged'
        or (k.action='Snoozed' and k.snoozed_until>now())
      )
  )
  order by
    case a.priority when 'Critical' then 1 when 'Urgent' then 2 else 3 end,
    a.due_at;

end
$$;

grant execute on function public.get_current_clinical_alerts() to authenticated;

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
begin
  select * into s
  from public.clinical_alert_settings
  where is_active=true
  order by updated_at desc
  limit 1;

  for a in select * from public.get_current_clinical_alerts() loop
    if a.overdue_minutes>=coalesce(s.manager_escalation_minutes,30)
       and lower(coalesce(a.alert_type,''))<>'regularisation' then
      insert into public.clinical_alert_escalations(
        alert_key,patient_id,alert_type,source_id,due_at,
        priority,escalation_reason
      )
      values(
        concat(a.alert_type,':',a.source_id,':',a.due_at),
        a.patient_id,a.alert_type,a.source_id,a.due_at,
        a.priority,
        concat(a.title,' overdue by ',a.overdue_minutes,' minutes')
      )
      on conflict(alert_key) do update set
        patient_id=excluded.patient_id,
        alert_type=excluded.alert_type,
        source_id=excluded.source_id,
        due_at=excluded.due_at,
        priority=excluded.priority,
        escalation_reason=case
          when public.clinical_alert_escalations.resolved_at is null
            then excluded.escalation_reason
          else public.clinical_alert_escalations.escalation_reason
        end;
      n:=n+1;
    end if;
  end loop;

  return jsonb_build_object(
    'success',true,
    'processed',n,
    'threshold_minutes',coalesce(s.manager_escalation_minutes,30)
  );
end
$$;

grant execute on function public.process_clinical_alert_escalations() to authenticated;

notify pgrst,'reload schema';

commit;

-- ------------------------------------------------------------
-- QUICK VERIFICATION (run after this migration if required)
-- ------------------------------------------------------------
-- select * from public.get_current_clinical_alerts();
-- select public.process_clinical_alert_escalations();
-- select alert_type,patient_id,source_id,due_at,escalation_reason,resolved_at
-- from public.clinical_alert_escalations
-- order by created_at desc;
