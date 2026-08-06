-- Samara Care ERP 1.3.28 - Clinical Alert Engine
create table if not exists public.clinical_alert_settings(
 id uuid primary key default gen_random_uuid(),setting_key text not null unique default 'global',
 sound_enabled boolean not null default true,voice_enabled boolean not null default false,
 browser_notifications_enabled boolean not null default false,medicine_lead_minutes int not null default 5,
 vitals_lead_minutes int not null default 5,care_lead_minutes int not null default 10,repeat_minutes int not null default 5,
 manager_escalation_minutes int not null default 30,medication_error_minutes int not null default 60,
 is_active boolean not null default true,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
insert into public.clinical_alert_settings(setting_key) values('global') on conflict(setting_key) do nothing;
create table if not exists public.clinical_alert_acknowledgements(
 id uuid primary key default gen_random_uuid(),alert_key text not null unique,alert_type text not null,source_id uuid,
 patient_id uuid,action text not null default 'Acknowledged',snoozed_until timestamptz,acknowledged_by uuid,
 acknowledged_at timestamptz default now(),created_at timestamptz default now());
create table if not exists public.clinical_alert_escalations(
 id uuid primary key default gen_random_uuid(),alert_key text not null unique,patient_id uuid,alert_type text,
 priority text,escalated_to_role text default 'Manager',escalation_reason text,created_at timestamptz default now(),resolved_at timestamptz);
alter table public.clinical_alert_settings enable row level security;
alter table public.clinical_alert_acknowledgements enable row level security;
alter table public.clinical_alert_escalations enable row level security;
drop policy if exists cas_select on public.clinical_alert_settings;
create policy cas_select on public.clinical_alert_settings for select to authenticated using(true);
drop policy if exists cas_admin on public.clinical_alert_settings;
create policy cas_admin on public.clinical_alert_settings for all to authenticated using(public.current_user_has_role(array['Admin'])) with check(public.current_user_has_role(array['Admin']));
drop policy if exists caa_select on public.clinical_alert_acknowledgements;
create policy caa_select on public.clinical_alert_acknowledgements for select to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));
drop policy if exists caa_write on public.clinical_alert_acknowledgements;
create policy caa_write on public.clinical_alert_acknowledgements for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));
drop policy if exists cae_select on public.clinical_alert_escalations;
create policy cae_select on public.clinical_alert_escalations for select to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse']));

create or replace function public.get_current_clinical_alerts()
returns table(alert_type text,source_id uuid,patient_id uuid,patient_name text,room_label text,title text,description text,due_at timestamptz,overdue_minutes int,priority text,status text,target_page text,voice_text text)
language plpgsql security definer set search_path=public as $$
declare s public.clinical_alert_settings%rowtype;
begin
 select * into s from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1;
 return query
 with pb as(select id,full_name,room_no,bed_no from public.patients where is_active=true),
 med as(
  select 'Medication'::text,mo.id,mo.patient_id,p.full_name,concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
  concat('Medicine Due: ',coalesce(mo.medicine_name,mo.medicine,'Medicine')),concat(coalesce(mo.strength,''),' · ',coalesce(mo.route,'')),
  (current_date+t.x)::timestamptz,greatest(0,floor(extract(epoch from(now()-(current_date+t.x)::timestamptz))/60))::int,
  case when now()>(current_date+t.x)::timestamptz+make_interval(mins=>coalesce(s.medication_error_minutes,60)) then 'Critical' when now()>(current_date+t.x)::timestamptz then 'Urgent' else 'Routine' end,
  'Active'::text,'Medicines'::text,concat('Attention. Medicine due for ',p.full_name,' in room ',coalesce(p.room_no,''))
  from public.medication_orders mo join pb p on p.id=mo.patient_id cross join lateral unnest(coalesce(mo.scheduled_times,array[]::time[])) t(x)
  where mo.is_active=true and (current_date+t.x)::timestamptz<=now()+make_interval(mins=>coalesce(s.medicine_lead_minutes,5))
  and not exists(select 1 from public.medication_administration ma where ma.medication_order_id=mo.id and ma.scheduled_date=current_date and ma.scheduled_time=t.x and ma.status in('Given','Refused','Withheld','Unavailable','Missed'))
 ),
 vit as(
  select 'Vital Signs',p.id,p.id,p.full_name,concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
  'Vital Signs Due','Routine vital observations are pending.',now(),0,'Urgent','Active','Vital Signs',concat('Vital signs are due for ',p.full_name)
  from pb p where not exists(select 1 from public.vital_signs v where v.patient_id=p.id and v.recorded_at::date=current_date)
 ),
 care as(
  select 'Daily Care',c.id,c.patient_id,p.full_name,concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
  concat('Daily Care Due: ',c.activity),coalesce(c.instructions,''),now(),0,'Routine','Active','Daily Care',concat('Daily care is due for ',p.full_name)
  from public.care_orders c join pb p on p.id=c.patient_id where c.is_active=true and not exists(select 1 from public.care_logs l where l.care_order_id=c.id and l.recorded_at::date=current_date and l.status='Completed')
 ),
 phy as(
  select 'Physiotherapy',p.id,p.patient_id,b.full_name,concat('Room ',coalesce(b.room_no,'—'),case when b.bed_no is not null then '-'||b.bed_no else '' end),
  concat('Physiotherapy Due: ',p.therapy_type),coalesce(p.precautions,''),(current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz,
  greatest(0,floor(extract(epoch from(now()-(current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz))/60))::int,
  case when now()>(current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz then 'Urgent' else 'Routine' end,'Active','Physiotherapy',concat('Physiotherapy is due for ',b.full_name)
  from public.physiotherapy_plans p join pb b on b.id=p.patient_id where p.is_active=true and (current_date+coalesce(p.preferred_time,time '10:00'))::timestamptz<=now()+interval '10 minutes'
  and not exists(select 1 from public.physiotherapy_sessions x where x.order_id=p.id and x.session_date=current_date)
 ), allx as(select * from med union all select * from vit union all select * from care union all select * from phy)
 select * from allx a where not exists(select 1 from public.clinical_alert_acknowledgements k where k.alert_key=concat(a.alert_type,':',a.source_id,':',a.due_at) and(k.action='Acknowledged' or(k.action='Snoozed' and k.snoozed_until>now())))
 order by case priority when 'Critical' then 1 when 'Urgent' then 2 else 3 end,due_at;
end $$;
grant execute on function public.get_current_clinical_alerts() to authenticated;

create or replace function public.process_clinical_alert_escalations() returns jsonb language plpgsql security definer set search_path=public as $$
declare a record;s public.clinical_alert_settings%rowtype;n int:=0;
begin select * into s from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1;
 for a in select * from public.get_current_clinical_alerts() loop
  if a.overdue_minutes>=coalesce(s.manager_escalation_minutes,30) then
   insert into public.clinical_alert_escalations(alert_key,patient_id,alert_type,priority,escalation_reason)
   values(concat(a.alert_type,':',a.source_id,':',a.due_at),a.patient_id,a.alert_type,a.priority,concat(a.title,' overdue by ',a.overdue_minutes,' minutes')) on conflict(alert_key) do nothing;n:=n+1;
  end if;
 end loop;return jsonb_build_object('success',true,'escalated',n);end $$;
grant execute on function public.process_clinical_alert_escalations() to authenticated;
notify pgrst,'reload schema';
