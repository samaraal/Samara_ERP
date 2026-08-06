-- Samara Care ERP 1.3.36
-- Clinical Alerts: show Daily Care only for the currently active shift.

create or replace function public.get_current_clinical_alerts()
returns table(
  alert_type text,source_id uuid,patient_id uuid,patient_name text,room_label text,
  title text,description text,due_at timestamptz,overdue_minutes int,priority text,
  status text,target_page text,voice_text text
)
language plpgsql security definer set search_path=public as $$
declare
  s public.clinical_alert_settings%rowtype;
  v_shift text;
begin
  select * into s from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1;
  v_shift:=case
    when (now() at time zone 'Asia/Kolkata')::time>=time '07:00'
     and (now() at time zone 'Asia/Kolkata')::time<time '19:00'
    then 'Day Shift (7 AM–7 PM)'
    else 'Night Shift (7 PM–7 AM)'
  end;

  return query
  with pb as(
    select id,full_name,room_no,bed_no from public.patients where is_active=true
  ),
  med as(
    select 'Medication'::text,mo.id,mo.patient_id,p.full_name,
      concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
      concat('Medicine Due: ',coalesce(mo.medicine_name,mo.medicine,'Medicine')),
      concat(coalesce(mo.strength,''),' · ',coalesce(mo.route,'')),
      (current_date+t.x)::timestamptz,
      greatest(0,floor(extract(epoch from(now()-(current_date+t.x)::timestamptz))/60))::int,
      case when now()>(current_date+t.x)::timestamptz+make_interval(mins=>coalesce(s.medication_error_minutes,60)) then 'Critical'
           when now()>(current_date+t.x)::timestamptz then 'Urgent' else 'Routine' end,
      'Active'::text,'Medicines'::text,
      concat('Attention. Medicine due for ',p.full_name,' in room ',coalesce(p.room_no,''))
    from public.medication_orders mo
    join pb p on p.id=mo.patient_id
    cross join lateral unnest(coalesce(mo.scheduled_times,array[]::time[])) t(x)
    where mo.is_active=true
      and (current_date+t.x)::timestamptz<=now()+make_interval(mins=>coalesce(s.medicine_lead_minutes,5))
      and not exists(
        select 1 from public.medication_administrations ma
        where ma.order_id=mo.id and ma.scheduled_date=current_date
          and ma.scheduled_time=t.x
          and ma.status in('Given','Refused','Withheld','Unavailable','Missed')
      )
  ),
  vit as(
    select 'Vital Signs',p.id,p.id,p.full_name,
      concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
      'Vital Signs Due','Routine vital observations are pending.',now(),0,'Urgent','Active','Vital Signs',
      concat('Vital signs are due for ',p.full_name)
    from pb p
    where not exists(
      select 1 from public.vital_signs v
      where v.patient_id=p.id and v.recorded_at::date=(now() at time zone 'Asia/Kolkata')::date
    )
  ),
  care as(
    select 'Daily Care',c.id,c.patient_id,p.full_name,
      concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
      concat('Daily Care Due: ',c.care_type),coalesce(c.instruction,''),now(),0,'Routine','Active','Daily Care',
      concat('Daily care is due for ',p.full_name)
    from public.care_orders c
    join pb p on p.id=c.patient_id
    where c.is_active=true
      and (c.shift=v_shift or c.shift='Both shifts')
      and not exists(
        select 1 from public.care_logs l
        where l.care_order_id=c.id
          and l.care_date=(now() at time zone 'Asia/Kolkata')::date
          and l.shift=v_shift
          and l.status in('Completed','Refused','Not required')
      )
  ),
  phy as(
    select 'Physiotherapy',p.id,p.patient_id,b.full_name,
      concat('Room ',coalesce(b.room_no,'—'),case when b.bed_no is not null then '-'||b.bed_no else '' end),
      concat('Physiotherapy Due: ',p.therapy_type),coalesce(p.precautions,''),
      (current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz,
      greatest(0,floor(extract(epoch from(now()-(current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz))/60))::int,
      case when now()>(current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz then 'Urgent' else 'Routine' end,
      'Active','Physiotherapy',concat('Physiotherapy is due for ',b.full_name)
    from public.physiotherapy_plans p join pb b on b.id=p.patient_id
    where p.is_active=true
      and (current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz<=now()+interval '10 minutes'
      and not exists(
        select 1 from public.physiotherapy_sessions x
        where (x.plan_id=p.id or x.order_id=p.id) and x.session_date=current_date
      )
  ),
  allx as(select * from med union all select * from vit union all select * from care union all select * from phy)
  select * from allx a
  where not exists(
    select 1 from public.clinical_alert_acknowledgements k
    where k.alert_key=concat(a.alert_type,':',a.source_id,':',a.due_at)
      and(k.action='Acknowledged' or(k.action='Snoozed' and k.snoozed_until>now()))
  )
  order by case priority when 'Critical' then 1 when 'Urgent' then 2 else 3 end,due_at;
end $$;

grant execute on function public.get_current_clinical_alerts() to authenticated;
notify pgrst,'reload schema';
