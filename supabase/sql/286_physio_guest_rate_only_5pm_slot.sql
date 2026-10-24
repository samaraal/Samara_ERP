-- 286 — Physiotherapy: Guest charges only by the per-Guest rate (Admin / Director, case by case);
-- Twice-daily plans with one time get 5:00 PM as the 2nd time; physio reminders count sessions in order.
-- Run once in Supabase SQL Editor after 284 / 285. Safe to re-run.
begin;
-- 1. No organisation-wide Guest fee. Any charge still Pending that came from one goes back to "waiting for Guest rate".
update public.physio_organisations set guest_fee=null where guest_fee is not null;
with undo as(select b.id,b.physiotherapy_session_id from public.bill_charge_requests b
  where b.physio_org_tariff_id is not null and b.patient_physio_rate_id is null and coalesce(b.approval_status,'Pending')='Pending')
update public.physiotherapy_sessions s set charge_request_id=null,billable=false,billing_rate=null,updated_at=now() from undo where s.id=undo.physiotherapy_session_id;
delete from public.bill_charge_requests b where b.physio_org_tariff_id is not null and b.patient_physio_rate_id is null and coalesce(b.approval_status,'Pending')='Pending';

create or replace function public.queue_patient_physio_charge(p_session uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype;r public.patient_physio_rates%rowtype;o public.physio_organisations%rowtype;request_id uuid;actor uuid;actor_name text;price numeric;source text;
begin
 select * into s from public.physiotherapy_sessions where id=p_session for update;
 if not found or s.status<>'Completed' or s.session_date>(now() at time zone 'Asia/Kolkata')::date then return null;end if;
 if s.charge_request_id is not null then return s.charge_request_id;end if;
 select id into request_id from public.bill_charge_requests where physiotherapy_session_id=s.id;
 if request_id is not null then return request_id;end if;
 if not exists(select 1 from public.patients where id=s.patient_id and is_active is true and coalesce(admission_status,'')<>'Discharged') then return null;end if;
 -- Respect the existing clinical approval switch rather than bypassing its workflow.
 if public.charge_category_requires_approval('Physiotherapy') then return null;end if;
 -- A manually raised physiotherapy charge on this date needs reconciliation, never a duplicate.
 if exists(select 1 from public.bill_charge_requests where patient_id=s.patient_id and category='Physiotherapy' and charge_date=s.session_date and physiotherapy_session_id is null and coalesce(approval_status,'Pending')<>'Rejected') then return null;end if;
 select * into r from public.patient_physio_rates where patient_id=s.patient_id and effective_from<=s.session_date order by effective_from desc limit 1;
 -- SQL 286: Guest physiotherapy charges are fixed case by case by Admin / Director — no organisation-wide fee.
 if not found then return null;end if;
 price:=r.amount;source:='Guest rate set by Admin / Director, effective '||r.effective_from;
 actor:=coalesce(auth.uid(),s.performed_by);
 select coalesce(nullif(full_name,''),'Staff') into actor_name from public.profiles where id=actor or auth_user_id=actor limit 1;
 insert into public.bill_charge_requests(patient_id,charge_date,service_datetime,category,service_code,service_name,service_provider,description,quantity,unit,unit_cost,estimated_amount,requested_amount,billable,bill_available,urgency,status,approval_status,remarks,raised_by,raised_by_name,physiotherapy_session_id,patient_physio_rate_id,physio_org_tariff_id)
 values(s.patient_id,s.session_date,coalesce(s.session_at,s.session_date::timestamp at time zone 'Asia/Kolkata'),'Physiotherapy','PATIENT_PHYSIO_SESSION','Regular Physiotherapy Session',s.physiotherapist_name,'Physiotherapy session on '||s.session_date||' · '||coalesce(s.notes,'Completed session'),1,'Session',price,price,price,true,false,'Routine','Raised','Pending',source,actor,coalesce(actor_name,'Staff'),s.id,r.id,o.id) returning id into request_id;
 update public.physiotherapy_sessions set billable=true,billing_rate=price,charge_request_id=request_id,updated_at=now() where id=s.id;
 perform public.record_audit_event('Physiotherapy Patient Charge Requested','Physiotherapy',s.id::text,jsonb_build_object('request_id',request_id,'rate_id',r.id,'organisation_tariff_id',o.id,'amount',price,'source',source),'Success');
 return request_id;
end $$;
revoke all on function public.queue_patient_physio_charge(uuid) from public,anon,authenticated;

create or replace function public.physio_unbilled_alerts() returns table(session_id uuid,patient_id uuid,guest_name text,session_date date,organisation text,reason text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.current_user_has_role(array['Admin','Accounts']) then return;end if;
 return query
 select x.id,x.patient_id,concat_ws(' ',p.title,p.full_name),x.session_date,o.name,
   case when public.charge_category_requires_approval('Physiotherapy') then 'Physiotherapy needs clinical approval (Approval Requests)'
        when exists(select 1 from public.bill_charge_requests b where b.patient_id=x.patient_id and b.category='Physiotherapy' and b.charge_date=x.session_date and b.physiotherapy_session_id is null and coalesce(b.approval_status,'Pending')<>'Rejected') then 'A manual physiotherapy charge exists for this date — reconcile'
        else 'Admin / Director has not set this Guest’s physiotherapy rate' end
 from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id left join public.physio_organisations o on o.id=x.organisation_id
 where x.status='Completed' and x.charge_request_id is null and p.is_active is true and coalesce(p.admission_status,'')<>'Discharged'
   and coalesce(x.session_at,x.session_date::timestamp at time zone 'Asia/Kolkata')<now()-interval '24 hours'
 order by x.session_date,x.id;
end $$;
revoke all on function public.physio_unbilled_alerts() from public,anon;
grant execute on function public.physio_unbilled_alerts() to authenticated;

-- 2. Twice-daily plans that hold only one time: 2nd session at 5:00 PM (as advised for these Guests).
update public.physiotherapy_plans set session_times=array[to_char((public.physio_plan_times(session_times,preferred_time::text))[1],'HH24:MI'),'17:00']
 where is_active=true and frequency ilike '%twice%' and cardinality(public.physio_plan_times(session_times,preferred_time::text))=1
   and (public.physio_plan_times(session_times,preferred_time::text))[1]<time '17:00';

-- 3. Reminders / escalations: sessions count in order (see physio_due_slots).
create or replace function public.physio_due_slots()
returns table(plan_id uuid,patient_id uuid,due_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 with clock as(select (now() at time zone 'Asia/Kolkata')::date as today)
 select pp.id,pp.patient_id,((slot.day+slot.at_time) at time zone 'Asia/Kolkata')::timestamptz
 from public.physiotherapy_plans pp join public.patients p on p.id=pp.patient_id cross join clock c
 cross join lateral(select public.physio_plan_times(pp.session_times, pp.preferred_time::text) as times) tt
 cross join lateral(
   -- Pending sessions already on record (any date up to today)
   select x.session_date as day,coalesce(x.scheduled_time,tt.times[1]) as at_time from public.physiotherapy_sessions x
   where (x.plan_id=pp.id or x.order_id=pp.id) and x.status='Pending' and x.session_date<=c.today
   union all
   -- today's session(s) with no record yet: one plan time = old rule (any session today counts);
   -- several plan times = each time needs its own session (2.18.94)
   select c.today, t.at_time from unnest(tt.times) with ordinality as t(at_time,n)
   -- SQL 286: sessions count in order — the Nth plan time is due only while fewer than N sessions exist today,
   -- so a morning session recorded late (e.g. 11:50) covers 8:00 AM and the 5:00 PM one is not due before 5 PM.
   where (select count(*) from public.physiotherapy_sessions x where (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date=c.today)<t.n
   and not exists(select 1 from public.physiotherapy_corrections r join public.physiotherapy_sessions x on x.id=r.session_id
     where r.state in ('Applying','Approved') and r.action='Reschedule' and (r.original->>'session_date')::date=c.today
     and (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date>c.today
     and (cardinality(tt.times)<=1 or (r.original->>'scheduled_time')::time is not distinct from t.at_time))
 ) slot
 where pp.is_active=true and p.is_active=true and coalesce(p.admission_status,'Active')<>'Discharged'
 and (pp.end_date is null or pp.end_date>=c.today) and (pp.start_date is null or pp.start_date<=c.today)
 and (p.admission_date<>c.today or p.admission_date is null or ((slot.day+slot.at_time) at time zone 'Asia/Kolkata')>=((p.admission_date+coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata'));
$$;
revoke all on function public.physio_due_slots() from public,authenticated;
commit;
notify pgrst,'reload schema';
select p.full_name as guest,pp.frequency,pp.session_times from public.physiotherapy_plans pp join public.patients p on p.id=pp.patient_id where pp.is_active order by 1;
