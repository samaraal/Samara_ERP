begin;
alter table public.medication_orders add column if not exists discharge_closed_at timestamptz,
 add column if not exists discharge_id uuid references public.patient_discharges(id),
 add column if not exists discharge_closure_reason text;
create table if not exists public.discharge_medication_reviews(
 id uuid primary key default gen_random_uuid(),discharge_id uuid not null references public.patient_discharges(id),
 patient_id uuid not null references public.patients(id),order_id uuid not null references public.medication_orders(id),
 scheduled_date date not null,scheduled_time text not null,previous_status text not null,
 status text not null default 'Pending' check(status in ('Pending','Reviewed')),
 review_note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 unique(discharge_id,order_id,scheduled_date,scheduled_time)
);
alter table public.discharge_medication_reviews enable row level security;
revoke all on public.discharge_medication_reviews from public,anon,authenticated;

create or replace function public.discharge_review_authorised()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true)
 and (role in ('Admin','Manager') or lower(trim(designation)) in ('nurse manager','nursing manager')))
 or public.stores_return_approval_allowed();
$$;

create or replace function public.enforce_discharge_initiator()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed boolean;
begin
 select exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role='Nurse'
 and not exists(select 1 from public.director_office_positions d where d.position_key='director' and d.assigned_profile_id=p.id)) into allowed;
 if tg_op='INSERT' then
   if not allowed then raise exception 'Only nursing staff may initiate discharge. Admin/Director may review and approve.';end if;
   if new.status<>'Initiated' or coalesce(new.management_status,'Pending')<>'Pending' or coalesce(new.accounts_status,'Pending')<>'Pending' then raise exception 'Discharge must start with the existing approval workflow';end if;
 elsif new.status='Completed' and old.status is distinct from 'Completed' then
   if not allowed then raise exception 'Final departure must be confirmed by nursing staff after accounts clearance';end if;
   if new.management_status<>'Approved' or new.accounts_status<>'Cleared' then raise exception 'Management approval and accounts clearance are required before departure';end if;
 elsif (new.status='Initiated' and old.status is distinct from new.status) or
       (new.management_status='Pending' and old.management_status is distinct from new.management_status) then
   if not allowed then raise exception 'Only nursing staff may re-initiate discharge.';end if;
 end if;
 return new;
end $$;
drop trigger if exists discharge_nursing_initiation_guard on public.patient_discharges;
create trigger discharge_nursing_initiation_guard before insert or update on public.patient_discharges for each row execute function public.enforce_discharge_initiator();
-- Include the assigned Director in the existing management approval RPC.
do $$ declare def text;begin
 select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_patient_discharge_v2' limit 1;
 if position('if v_role not in (''Admin'',''Manager'') then' in def)>0 then
 execute replace(def,'if v_role not in (''Admin'',''Manager'') then','if coalesce(v_role,'''')<>''Manager'' and not public.stores_return_approval_allowed() then');
 elsif position('stores_return_approval_allowed' in def)=0 then raise exception 'Unexpected discharge approval definition';end if;
end $$;

create or replace function public.close_discharge_clinical_work(p_discharge_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.patient_discharges%rowtype; p public.patients%rowtype; cutoff timestamptz;
begin
 select * into d from public.patient_discharges where id=p_discharge_id;
 if not found or d.status<>'Completed' then return;end if;
 cutoff:=coalesce(d.actual_departure_at,d.final_departure_at,d.completed_at);
 if cutoff is null then raise exception 'Completed discharge requires an actual departure time';end if;
 select * into p from public.patients where id=d.patient_id for update;
 -- Reconciliation must never close a later admission.
 if p.admission_date>(cutoff at time zone 'Asia/Kolkata')::date then return;end if;
 insert into public.discharge_medication_reviews(discharge_id,patient_id,order_id,scheduled_date,scheduled_time,previous_status)
 select d.id,p.id,o.id,day.dt::date,left(t.tm,5),coalesce(m.status,'Unrecorded before departure')
 from public.medication_orders o
 cross join lateral generate_series(greatest(coalesce(o.start_date,(o.created_at at time zone 'Asia/Kolkata')::date),coalesce(p.admission_date,(o.created_at at time zone 'Asia/Kolkata')::date))::timestamp,(cutoff at time zone 'Asia/Kolkata')::date::timestamp,interval '1 day') day(dt)
 cross join lateral unnest(o.scheduled_times) t(tm)
 left join public.medication_administrations m on m.order_id=o.id and m.scheduled_date=day.dt::date and left(m.scheduled_time,5)=left(t.tm,5)
 where o.patient_id=p.id and t.tm ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 and (o.is_active is distinct from false or o.stopped_at is not null)
 and (o.end_date is null or day.dt::date<=o.end_date)
 and ((day.dt::date+t.tm::time) at time zone 'Asia/Kolkata')<cutoff
 and ((day.dt::date+t.tm::time) at time zone 'Asia/Kolkata')>=coalesce(o.effective_from,o.created_at)
 and (o.stopped_at is null or ((day.dt::date+t.tm::time) at time zone 'Asia/Kolkata')<o.stopped_at)
 and (m.id is null or lower(coalesce(m.status,'')) in ('missed','refused','delayed','not given','withheld','unavailable'))
 on conflict(discharge_id,order_id,scheduled_date,scheduled_time) do nothing;
 update public.medication_orders set is_active=false,stopped_at=least(coalesce(stopped_at,cutoff),cutoff),
 discharge_closed_at=cutoff,discharge_id=d.id,discharge_closure_reason='Not applicable—patient discharged. Pre-departure records retained for review.'
 where patient_id=p.id and (is_active is distinct from false or stopped_at>cutoff);
 update public.care_orders set is_active=false where patient_id=p.id and is_active is distinct from false;
 update public.patients set is_active=false,admission_status='Discharged' where id=p.id;
end $$;
revoke all on function public.close_discharge_clinical_work(uuid) from public,anon,authenticated;

create or replace function public.discharge_clinical_completion_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Completed' and (tg_op='INSERT' or old.status is distinct from 'Completed') then perform public.close_discharge_clinical_work(new.id);end if;
 return new;
end $$;
drop trigger if exists discharge_clinical_completion on public.patient_discharges;
create trigger discharge_clinical_completion after insert or update of status on public.patient_discharges for each row execute function public.discharge_clinical_completion_trigger();

create or replace function public.guard_discharge_medication_entry()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.patients%rowtype; o public.medication_orders%rowtype; cutoff timestamptz; due timestamptz;
begin
 select * into p from public.patients where id=new.patient_id for share;
 select * into o from public.medication_orders where id=new.order_id;
 if o.patient_id is distinct from new.patient_id then raise exception 'Medication order and patient do not match';end if;
 cutoff:=o.discharge_closed_at;
 if cutoff is null and (p.is_active=false or p.admission_status='Discharged') then
   select coalesce(actual_departure_at,final_departure_at,completed_at) into cutoff from public.patient_discharges where patient_id=p.id and status='Completed' order by coalesce(actual_departure_at,final_departure_at,completed_at) desc limit 1;
 end if;
 if cutoff is not null then
   due:=(new.scheduled_date+new.scheduled_time::time) at time zone 'Asia/Kolkata';
   if due>=cutoff or coalesce(new.administered_at,now())>=cutoff then raise exception 'Patient discharged: post-departure medication entries are not permitted';end if;
   if not public.discharge_review_authorised() or nullif(trim(new.late_entry_justification),'') is null then raise exception 'Pre-departure corrections require Nursing Manager/Admin review and a late-entry justification';end if;
 elsif p.is_active=false or p.admission_status='Discharged' then raise exception 'Patient is inactive. Medication administration is unavailable';
 end if;
 return new;
end $$;
drop trigger if exists medication_discharge_entry_guard on public.medication_administrations;
create trigger medication_discharge_entry_guard before insert or update on public.medication_administrations for each row execute function public.guard_discharge_medication_entry();

create or replace function public.guard_active_patient_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.is_active is distinct from false then
   if not exists(select 1 from public.patients where id=new.patient_id and is_active is distinct from false and admission_status is distinct from 'Discharged') then raise exception 'New clinical orders require an active admitted patient';end if;
   if tg_table_name='medication_orders' and to_jsonb(new)->>'discharge_closed_at' is not null then raise exception 'Discharge-closed prescriptions cannot be reactivated. A new admission requires a reviewed new prescription';end if;
 end if;
 return new;
end $$;
drop trigger if exists medication_active_patient_guard on public.medication_orders;
create trigger medication_active_patient_guard before insert or update on public.medication_orders for each row execute function public.guard_active_patient_order();
drop trigger if exists care_active_patient_guard on public.care_orders;
create trigger care_active_patient_guard before insert or update on public.care_orders for each row execute function public.guard_active_patient_order();

create or replace function public.discharge_medication_review_list()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.discharge_review_authorised() then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(q order by q.scheduled_date desc,q.scheduled_time) from (
 select r.*,p.full_name as patient_name,o.medicine_name,o.strength from public.discharge_medication_reviews r join public.patients p on p.id=r.patient_id join public.medication_orders o on o.id=r.order_id where r.status='Pending' order by r.scheduled_date desc,r.scheduled_time limit 500) q),'[]'::jsonb);
end $$;
create or replace function public.review_discharge_medication(p_id uuid,p_note text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;
begin
 if not public.discharge_review_authorised() then raise exception 'Nursing Manager/Admin review required';end if;
 if nullif(trim(p_note),'') is null then raise exception 'Review outcome is required';end if;
 select actor_id into me from public.stores_actor();
 update public.discharge_medication_reviews set status='Reviewed',review_note=trim(p_note),reviewed_by=me,reviewed_at=now() where id=p_id and status='Pending';
 if not found then raise exception 'This item has already been reviewed';end if;
 insert into public.audit_log(user_id,action,entity,entity_id,details) values(me,'Reviewed','Discharge Medication',p_id::text,jsonb_build_object('note',trim(p_note)));
end $$;
revoke all on function public.discharge_review_authorised(),public.discharge_medication_review_list(),public.review_discharge_medication(uuid,text) from public,anon;
grant execute on function public.discharge_review_authorised(),public.discharge_medication_review_list(),public.review_discharge_medication(uuid,text) to authenticated;

-- Repair completed admissions without altering their approvals or departure records.
do $$ declare r record;begin
 for r in select distinct on(d.patient_id) d.id from public.patient_discharges d join public.patients p on p.id=d.patient_id where d.status='Completed' and p.is_active=false and coalesce(d.actual_departure_at,d.final_departure_at,d.completed_at) is not null order by d.patient_id,coalesce(d.actual_departure_at,d.final_departure_at,d.completed_at) desc loop
 perform public.close_discharge_clinical_work(r.id);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
