-- Samara Care ERP v2.9.26
-- Clinical escalation backend repair
-- Fixes:
-- 1. Vitals / Daily Care due times are anchored to the current 7 AM / 7 PM shift start.
-- 2. overdue_minutes therefore continues increasing instead of remaining at zero.
-- 3. clinical_alert_escalations stores source_id + due_at used by the ERP.
-- 4. escalation processing records the authoritative source identity and live delay.
-- 5. Manager/Admin resolution RPC with mandatory remarks is provided.

begin;

alter table public.clinical_alert_escalations
  add column if not exists source_id uuid,
  add column if not exists due_at timestamptz,
  add column if not exists resolution_action text,
  add column if not exists resolution_remarks text,
  add column if not exists resolved_by uuid;

create index if not exists idx_clinical_alert_escalations_open
  on public.clinical_alert_escalations(resolved_at, patient_id, alert_type);
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
  with pb as(
    select id,full_name,room_no,bed_no
    from public.patients
    where is_active=true
  ),
  med as(
    select
      'Medication'::text,
      mo.id,
      mo.patient_id,
      p.full_name,
      concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
      concat('Medicine Due: ',coalesce(mo.medicine_name,mo.medicine,'Medicine')),
      concat(coalesce(mo.strength,''),' · ',coalesce(mo.route,'')),
      ((v_today+t.x) at time zone 'Asia/Kolkata')::timestamptz,
      greatest(0,floor(extract(epoch from(now()-((v_today+t.x) at time zone 'Asia/Kolkata')))/60))::int,
      case
        when now()>((v_today+t.x) at time zone 'Asia/Kolkata')+make_interval(mins=>coalesce(s.medication_error_minutes,60)) then 'Critical'
        when now()>((v_today+t.x) at time zone 'Asia/Kolkata') then 'Urgent'
        else 'Routine'
      end,
      'Active'::text,
      'Medicines'::text,
      concat('Attention. Medicine due for ',p.full_name,' in room ',coalesce(p.room_no,''))
    from public.medication_orders mo
    join pb p on p.id=mo.patient_id
    cross join lateral unnest(coalesce(mo.scheduled_times,array[]::time[])) t(x)
    where mo.is_active=true
      and ((v_today+t.x) at time zone 'Asia/Kolkata')<=now()+make_interval(mins=>coalesce(s.medicine_lead_minutes,5))
      and not exists(
        select 1
        from public.medication_administrations ma
        where ma.order_id=mo.id
          and ma.scheduled_date=v_today
          and ma.scheduled_time=t.x
          and ma.status in('Given','Refused','Withheld','Unavailable','Missed')
      )
  ),
  vit as(
    select
      'Vital Signs'::text,
      p.id,
      p.id,
      p.full_name,
      concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
      'Vital Signs Due'::text,
      'Routine vital observations are pending.'::text,
      v_shift_start,
      greatest(0,floor(extract(epoch from(now()-v_shift_start)/60))::int),
      case
        when now()>=v_shift_start+make_interval(mins=>coalesce(s.manager_escalation_minutes,30)) then 'Urgent'
        else 'Routine'
      end,
      'Active'::text,
      'Vital Signs'::text,
      concat('Vital signs are due for ',p.full_name)
    from pb p
    where now()>=v_shift_start
      and not exists(
        select 1
        from public.vital_signs v
        where v.patient_id=p.id
          and v.recorded_at>=v_shift_start
          and v.recorded_at<case when v_shift='Day Shift (7 AM–7 PM)' then v_shift_start+interval '12 hours' else v_shift_start+interval '12 hours' end
      )
  ),
  care as(
    select
      'Daily Care'::text,
      c.id,
      c.patient_id,
      p.full_name,
      concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
      concat('Daily Care Due: ',c.care_type),
      coalesce(c.instruction,''),
      v_shift_start,
      greatest(0,floor(extract(epoch from(now()-v_shift_start)/60))::int),
      case
        when now()>=v_shift_start+make_interval(mins=>coalesce(s.manager_escalation_minutes,30)) then 'Urgent'
        else 'Routine'
      end,
      'Active'::text,
      'Daily Care'::text,
      concat('Daily care is due for ',p.full_name)
    from public.care_orders c
    join pb p on p.id=c.patient_id
    where c.is_active=true
      and (c.shift=v_shift or c.shift='Both shifts')
      and now()>=v_shift_start
      and not exists(
        select 1
        from public.care_logs l
        where l.care_order_id=c.id
          and l.care_date=v_shift_start_local::date
          and l.shift=v_shift
          and l.status in('Completed','Refused','Not required')
      )
  ),
  phy as(
    select
      'Physiotherapy'::text,
      pp.id,
      pp.patient_id,
      b.full_name,
      concat('Room ',coalesce(b.room_no,'—'),case when b.bed_no is not null then '-'||b.bed_no else '' end),
      concat('Physiotherapy Due: ',pp.therapy_type),
      coalesce(pp.precautions,''),
      ((v_today+coalesce(pp.preferred_time,time '10:00')) at time zone 'Asia/Kolkata')::timestamptz,
      greatest(0,floor(extract(epoch from(now()-((v_today+coalesce(pp.preferred_time,time '10:00')) at time zone 'Asia/Kolkata')))/60))::int,
      case when now()>((v_today+coalesce(pp.preferred_time,time '10:00')) at time zone 'Asia/Kolkata') then 'Urgent' else 'Routine' end,
      'Active'::text,
      'Physiotherapy'::text,
      concat('Physiotherapy is due for ',b.full_name)
    from public.physiotherapy_plans pp
    join pb b on b.id=pp.patient_id
    where pp.is_active=true
      and ((v_today+coalesce(pp.preferred_time,time '10:00')) at time zone 'Asia/Kolkata')<=now()+interval '10 minutes'
      and not exists(
        select 1
        from public.physiotherapy_sessions x
        where (x.plan_id=pp.id or x.order_id=pp.id)
          and x.session_date=v_today
      )
  ),
  allx as(
    select * from med
    union all select * from vit
    union all select * from care
    union all select * from phy
  )
  select *
  from allx a
  where not exists(
    select 1
    from public.clinical_alert_acknowledgements k
    where k.alert_key=concat(a.alert_type,':',a.source_id,':',a.due_at)
      and (k.action='Acknowledged' or (k.action='Snoozed' and k.snoozed_until>now()))
  )
  order by case priority when 'Critical' then 1 when 'Urgent' then 2 else 3 end,due_at;
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
    if a.overdue_minutes>=coalesce(s.manager_escalation_minutes,30) then
      insert into public.clinical_alert_escalations(
        alert_key,patient_id,alert_type,source_id,due_at,priority,escalation_reason
      ) values(
        concat(a.alert_type,':',a.source_id,':',a.due_at),
        a.patient_id,
        a.alert_type,
        a.source_id,
        a.due_at,
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
          when public.clinical_alert_escalations.resolved_at is null then excluded.escalation_reason
          else public.clinical_alert_escalations.escalation_reason
        end;
      n:=n+1;
    end if;
  end loop;

  return jsonb_build_object('success',true,'processed',n,'threshold_minutes',coalesce(s.manager_escalation_minutes,30));
end
$$;

grant execute on function public.process_clinical_alert_escalations() to authenticated;

create or replace function public.resolve_clinical_escalation(
  p_escalation_id uuid,
  p_resolution_remarks text,
  p_resolution_action text default 'Resolved'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_user uuid:=auth.uid();
begin
  select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') not in ('Admin','Manager') then
    raise exception 'Only Manager or Administrator can resolve clinical escalations.';
  end if;

  if length(trim(coalesce(p_resolution_remarks,'')))<5 then
    raise exception 'Resolution / corrective-action remarks are mandatory.';
  end if;

  update public.clinical_alert_escalations
  set resolved_at=now(),
      resolved_by=v_user,
      resolution_action=coalesce(nullif(trim(p_resolution_action),''),'Resolved'),
      resolution_remarks=trim(p_resolution_remarks)
  where id=p_escalation_id
    and resolved_at is null;

  if not found then
    raise exception 'Escalation not found or already resolved.';
  end if;

  return jsonb_build_object('success',true,'escalation_id',p_escalation_id,'resolved_at',now());
end
$$;

grant execute on function public.resolve_clinical_escalation(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
