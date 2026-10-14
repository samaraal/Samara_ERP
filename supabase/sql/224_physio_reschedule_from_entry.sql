begin;
create or replace function public.request_planned_physio_reschedule(p_plan uuid,p_original_date date,p_new_date date,p_new_time time,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.physiotherapy_plans%rowtype; s public.physiotherapy_sessions%rowtype; sid uuid;
begin
 if auth.uid() is null or not(public.current_user_has_role(array['Nurse','Caregiver','Admin']) or public.physiotherapy_can_review()) then raise exception 'Clinical staff access required';end if;
 if p_original_date is null or p_original_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Select today or a previous scheduled date';end if;
 if p_new_date is null or p_new_time is null or p_new_date<(now() at time zone 'Asia/Kolkata')::date or nullif(trim(p_reason),'') is null then raise exception 'Enter the new date, time and reason';end if;
 select * into plan from public.physiotherapy_plans where id=p_plan for update;
 if not found or plan.is_active=false then raise exception 'Active physiotherapy plan not found';end if;
 if not exists(select 1 from public.patients where id=plan.patient_id and is_active is distinct from false and admission_status is distinct from 'Discharged') then raise exception 'Patient discharged or unavailable';end if;
 select * into s from public.physiotherapy_sessions where (order_id=p_plan or plan_id=p_plan) and session_date=p_original_date for update;
 if found then
   if s.status<>'Pending' or s.session_at is not null then raise exception 'An outcome is already recorded. Use Session options on that entry to request a correction';end if;
   sid:=s.id;
 else
   insert into public.physiotherapy_sessions(plan_id,order_id,patient_id,session_date,scheduled_time,status,session_at,performed_by,physiotherapist_name,reason)
   values(p_plan,p_plan,plan.patient_id,p_original_date,nullif(trim(plan.preferred_time::text),'')::time,'Pending',null,null,plan.physiotherapist_name,'Scheduled session; reschedule awaiting approval') returning id into sid;
 end if;
 return public.request_physiotherapy_correction(sid,'Reschedule',p_reason,jsonb_build_object('session_date',p_new_date,'scheduled_time',p_new_time));
end $$;
revoke all on function public.request_planned_physio_reschedule(uuid,date,date,time,text) from public;
grant execute on function public.request_planned_physio_reschedule(uuid,date,date,time,text) to authenticated;
commit;
notify pgrst,'reload schema';
select to_regprocedure('public.request_planned_physio_reschedule(uuid,date,date,time,text)') is not null as entry_reschedule_ready;
