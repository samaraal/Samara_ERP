-- Samara Care ERP 2.19.81 — Physiotherapy: Reschedule the 2nd / 3rd session of the day (07-11-2026)
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- Problem: Mr. S. Swaminathan's plan is twice daily (07:00–09:00 and 16:00–18:00). Session 1 was done at 09:30.
-- Rescheduling the 2nd session (16:00–18:00) to 19:00 failed with
-- "An outcome is already recorded. Use Session options on that entry to request a correction".
-- Cause: request_planned_physio_reschedule (file 224, written when a plan had only one session a day) looked up
-- the session by plan + DATE only, so it found the completed 1st session and refused.
-- Fix: the session is now found by plan + date + SESSION TIME (the same rule as SQL 280), so each session of the
-- day is rescheduled on its own. The Physiotherapist login may also request a reschedule (as in SQL 337).
-- Nothing else is changed: approval by Nursing Manager / Admin works exactly as before.

begin;

create or replace function public.request_planned_physio_reschedule(p_plan uuid,p_original_date date,p_new_date date,p_new_time time,p_reason text,p_slot_time time)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.physiotherapy_plans%rowtype; s public.physiotherapy_sessions%rowtype; sid uuid; slot time;
begin
 if auth.uid() is null or not(public.current_user_has_role(array['Nurse','Caregiver','Physiotherapist','Admin']) or public.physiotherapy_can_review()) then raise exception 'Clinical staff access required';end if;
 if p_original_date is null or p_original_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Select today or a previous scheduled date';end if;
 if p_new_date is null or p_new_time is null or p_new_date<(now() at time zone 'Asia/Kolkata')::date or nullif(trim(p_reason),'') is null then raise exception 'Enter the new date, time and reason';end if;
 select * into plan from public.physiotherapy_plans where id=p_plan for update;
 if not found or plan.is_active=false then raise exception 'Active physiotherapy plan not found';end if;
 if not exists(select 1 from public.patients where id=plan.patient_id and is_active is distinct from false and admission_status is distinct from 'Discharged') then raise exception 'Patient discharged or unavailable';end if;

 if p_slot_time is not null then
   -- this exact session of the day
   slot:=p_slot_time;
   select * into s from public.physiotherapy_sessions
    where (order_id=p_plan or plan_id=p_plan) and session_date=p_original_date
      and coalesce(scheduled_time,time '00:00')=slot
    limit 1 for update;
 else
   -- older screens that do not send the session time: use the open (not yet recorded) session of that date
   select * into s from public.physiotherapy_sessions
    where (order_id=p_plan or plan_id=p_plan) and session_date=p_original_date and status='Pending' and session_at is null
    order by scheduled_time nulls last limit 1 for update;
   slot:=nullif(trim(plan.preferred_time::text),'')::time;
 end if;

 if found then
   if s.status<>'Pending' or s.session_at is not null then
     raise exception 'This session (%) already has an outcome recorded. Use Session options on that entry to request a correction', coalesce(to_char(s.scheduled_time,'HH24:MI'),'no time');
   end if;
   if exists(select 1 from public.physiotherapy_corrections where session_id=s.id and state in ('Pending','Applying')) then
     raise exception 'A change for this session is already waiting for Nursing Manager / Admin approval';
   end if;
   sid:=s.id;
 else
   begin
     insert into public.physiotherapy_sessions(plan_id,order_id,patient_id,session_date,scheduled_time,status,session_at,performed_by,physiotherapist_name,reason)
     values(p_plan,p_plan,plan.patient_id,p_original_date,slot,'Pending',null,null,plan.physiotherapist_name,'Scheduled session; reschedule awaiting approval') returning id into sid;
   exception when unique_violation then
     raise exception 'A session at % on this date is already recorded. Choose the correct session in "Session (plan time)"', coalesce(to_char(slot,'HH24:MI'),'this time');
   end;
 end if;
 return public.request_physiotherapy_correction(sid,'Reschedule',p_reason,jsonb_build_object('session_date',p_new_date,'scheduled_time',p_new_time));
end $$;

-- the old 5-value version (screens not yet refreshed) now uses the same logic
create or replace function public.request_planned_physio_reschedule(p_plan uuid,p_original_date date,p_new_date date,p_new_time time,p_reason text)
returns uuid language sql security definer set search_path=public,pg_temp as $$
 select public.request_planned_physio_reschedule(p_plan,p_original_date,p_new_date,p_new_time,p_reason,null::time);
$$;

revoke all on function public.request_planned_physio_reschedule(uuid,date,date,time,text,time) from public;
revoke all on function public.request_planned_physio_reschedule(uuid,date,date,time,text) from public;
grant execute on function public.request_planned_physio_reschedule(uuid,date,date,time,text,time) to authenticated;
grant execute on function public.request_planned_physio_reschedule(uuid,date,date,time,text) to authenticated;

commit;
notify pgrst,'reload schema';

-- Check: should be true
select to_regprocedure('public.request_planned_physio_reschedule(uuid,date,date,time,text,time)') is not null as reschedule_by_session_time_ready;
