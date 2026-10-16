-- Patient-specific physiotherapy pricing. No generic tariff fallback and no automatic ledger posting.
begin;
create table if not exists public.patient_physio_rates(
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.patients(id),
 effective_from date not null,
 amount numeric(12,2) not null check(amount>0 and amount::text not in ('NaN','Infinity','-Infinity')),
 notes text not null check(length(trim(notes))>=5),
 approved_by uuid not null,created_at timestamptz not null default now(),
 unique(patient_id,effective_from)
);
alter table public.patient_physio_rates enable row level security;
revoke all on public.patient_physio_rates from anon,authenticated;
grant select on public.patient_physio_rates to authenticated;
drop policy if exists patient_physio_rate_finance_read on public.patient_physio_rates;
create policy patient_physio_rate_finance_read on public.patient_physio_rates for select to authenticated
using(public.current_user_has_role(array['Admin','Accounts']));
alter table public.bill_charge_requests add column if not exists physiotherapy_session_id uuid unique references public.physiotherapy_sessions(id);
alter table public.bill_charge_requests add column if not exists patient_physio_rate_id uuid references public.patient_physio_rates(id);

create or replace function public.queue_patient_physio_charge(p_session uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype;r public.patient_physio_rates%rowtype;request_id uuid;actor uuid;actor_name text;
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
 if not found then return null;end if;
 actor:=coalesce(auth.uid(),s.performed_by);
 select coalesce(nullif(full_name,''),'Staff') into actor_name from public.profiles where id=actor or auth_user_id=actor limit 1;
 insert into public.bill_charge_requests(patient_id,charge_date,service_datetime,category,service_code,service_name,service_provider,description,quantity,unit,unit_cost,estimated_amount,requested_amount,billable,bill_available,urgency,status,approval_status,remarks,raised_by,raised_by_name,physiotherapy_session_id,patient_physio_rate_id)
 values(s.patient_id,s.session_date,coalesce(s.session_at,s.session_date::timestamp at time zone 'Asia/Kolkata'),'Physiotherapy','PATIENT_PHYSIO_SESSION','Regular Physiotherapy Session',s.physiotherapist_name,'Physiotherapy session on '||s.session_date||' · '||coalesce(s.notes,'Completed session'),1,'Session',r.amount,r.amount,r.amount,true,false,'Routine','Raised','Pending','Patient-specific Admin/Director rate effective '||r.effective_from,actor,coalesce(actor_name,'Staff'),s.id,r.id) returning id into request_id;
 update public.physiotherapy_sessions set billable=true,billing_rate=r.amount,charge_request_id=request_id,updated_at=now() where id=s.id;
 perform public.record_audit_event('Physiotherapy Patient Charge Requested','Physiotherapy',s.id::text,jsonb_build_object('request_id',request_id,'rate_id',r.id,'amount',r.amount),'Success');
 return request_id;
end $$;
revoke all on function public.queue_patient_physio_charge(uuid) from public,anon,authenticated;

create or replace function public.patient_physio_session_billing_sync() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Completed' and new.charge_request_id is null then perform public.queue_patient_physio_charge(new.id);end if;
 return new;
end $$;
revoke all on function public.patient_physio_session_billing_sync() from public,anon,authenticated;
drop trigger if exists patient_physio_billing_sync on public.physiotherapy_sessions;
create trigger patient_physio_billing_sync after insert or update of status on public.physiotherapy_sessions for each row execute function public.patient_physio_session_billing_sync();

create or replace function public.guard_patient_physio_charge() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype;r public.patient_physio_rates%rowtype;
begin
 if tg_op='UPDATE' and old.physiotherapy_session_id is not null then
  if row(new.physiotherapy_session_id,new.patient_physio_rate_id,new.patient_id,new.charge_date,new.category,new.service_name,new.quantity,new.unit_cost,new.requested_amount,new.billable,new.bill_available)
     is distinct from row(old.physiotherapy_session_id,old.patient_physio_rate_id,old.patient_id,old.charge_date,old.category,old.service_name,old.quantity,old.unit_cost,old.requested_amount,old.billable,old.bill_available) then
    raise exception 'Linked physiotherapy session and agreed rate are fixed. Accounts must review the existing request; do not change its source or price';end if;
 end if;
 if new.physiotherapy_session_id is null then
  if new.patient_physio_rate_id is not null then raise exception 'Patient physiotherapy rate needs a completed-session link';end if;
  return new;
 end if;
 select * into s from public.physiotherapy_sessions where id=new.physiotherapy_session_id;
 select * into r from public.patient_physio_rates where id=new.patient_physio_rate_id;
 if s.id is null or s.status<>'Completed' or s.patient_id<>new.patient_id or s.session_date<>new.charge_date or r.id is null or r.patient_id<>s.patient_id or r.effective_from>s.session_date
 or new.category<>'Physiotherapy' or new.quantity is distinct from 1::numeric or new.unit_cost is distinct from r.amount or new.requested_amount is distinct from r.amount or not new.billable or new.bill_available then
 raise exception 'Physiotherapy request must match the completed session and Admin-approved patient rate';end if;
 return new;
end $$;
revoke all on function public.guard_patient_physio_charge() from public,anon,authenticated;
drop trigger if exists patient_physio_charge_guard on public.bill_charge_requests;
create trigger patient_physio_charge_guard before insert or update on public.bill_charge_requests for each row execute function public.guard_patient_physio_charge();

create or replace function public.patient_physio_billing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid;day date;price numeric;rid uuid;queued_session record;queued integer:=0;request_id uuid;next_day date;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts']) then raise exception 'Admin or Accounts access required';end if;
 if p_action='load' then
 return jsonb_build_object(
 'clinical_approval_required',public.charge_category_requires_approval('Physiotherapy'),
 'patients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'patient_id',p.patient_id,'admission_date',p.admission_date) order by p.full_name) from public.patients p where p.is_active is true and coalesce(p.admission_status,'')<>'Discharged' and (exists(select 1 from public.physiotherapy_plans x where x.patient_id=p.id) or exists(select 1 from public.physiotherapy_sessions x where x.patient_id=p.id))),'[]'),
 'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_from desc) from public.patient_physio_rates r),'[]'),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'patient_id',s.patient_id,'session_date',s.session_date,'notes',s.notes,'physiotherapist',s.physiotherapist_name,'request_id',s.charge_request_id,'billing_rate',s.billing_rate,'approval_status',b.approval_status,'amount',coalesce(b.final_amount,b.requested_amount),'manual_charge_exists',exists(select 1 from public.bill_charge_requests x where x.patient_id=s.patient_id and x.category='Physiotherapy' and x.charge_date=s.session_date and x.physiotherapy_session_id is null and coalesce(x.approval_status,'Pending')<>'Rejected')) order by s.session_date desc) from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id left join public.bill_charge_requests b on b.id=s.charge_request_id where p.is_active is true and coalesce(p.admission_status,'')<>'Discharged' and s.status='Completed' and s.session_date<=(now() at time zone 'Asia/Kolkata')::date),'[]'));
 end if;
 if p_action<>'save_rate' then raise exception 'Unknown patient physiotherapy billing action';end if;
 if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin / Director can set a patient physiotherapy rate';end if;
 pid:=(p_data->>'patient_id')::uuid;day:=(p_data->>'effective_from')::date;price:=(p_data->>'amount')::numeric;
 perform 1 from public.patients where id=pid and is_active is true and coalesce(admission_status,'')<>'Discharged' for update;
 if not found then raise exception 'Select an active patient';end if;
 if day is null or day>(now() at time zone 'Asia/Kolkata')::date or price is null or price<=0 or price<>round(price,2) or price::text in ('NaN','Infinity','-Infinity') or length(trim(coalesce(p_data->>'notes','')))<5 then raise exception 'Enter the agreed positive rate, effective date and approval notes';end if;
 select min(effective_from) into next_day from public.patient_physio_rates where patient_id=pid and effective_from>day;
 if exists(select 1 from public.physiotherapy_sessions where patient_id=pid and charge_request_id is not null and session_date>=day and (next_day is null or session_date<next_day)) then raise exception 'A billing request already exists in this rate period. Existing requests keep their approved rate; choose a different effective date';end if;
 if exists(select 1 from public.patient_physio_rates where patient_id=pid and effective_from=day) then raise exception 'A rate is already approved from this date. Rate history cannot be overwritten';end if;
 insert into public.patient_physio_rates(patient_id,effective_from,amount,notes,approved_by) values(pid,day,price,trim(p_data->>'notes'),auth.uid()) returning id into rid;
 for queued_session in select id from public.physiotherapy_sessions where patient_id=pid and status='Completed' and charge_request_id is null and session_date>=day and session_date<=(now() at time zone 'Asia/Kolkata')::date order by session_date,id loop
 request_id:=public.queue_patient_physio_charge(queued_session.id);if request_id is not null then queued:=queued+1;end if;
 end loop;
 perform public.record_audit_event('Patient Physiotherapy Rate Approved','Physiotherapy',pid::text,jsonb_build_object('rate_id',rid,'amount',price,'effective_from',day,'notes',p_data->>'notes','requests_queued',queued),'Success');
 return jsonb_build_object('rate_id',rid,'queued',queued);
end $$;
revoke all on function public.patient_physio_billing(text,jsonb) from public,anon;
grant execute on function public.patient_physio_billing(text,jsonb) to authenticated;

-- Preserve all existing approval behaviour for other clinical charges.
do $$begin
 if to_regprocedure('public.decide_bill_charge_request_before_patient_physio(uuid,text,numeric,text)') is null then
 alter function public.decide_bill_charge_request_v5(uuid,text,numeric,text) rename to decide_bill_charge_request_before_patient_physio;
 end if;
end $$;
revoke all on function public.decide_bill_charge_request_before_patient_physio(uuid,text,numeric,text) from public,anon,authenticated;
create or replace function public.decide_bill_charge_request_v5(p_request_id uuid,p_decision text,p_approved_amount numeric default 0,p_remarks text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype;tid uuid;staff_name text;decision text:=trim(p_decision);
begin
 select * into r from public.bill_charge_requests where id=p_request_id for update;
 if r.physiotherapy_session_id is null then return public.decide_bill_charge_request_before_patient_physio(p_request_id,p_decision,p_approved_amount,p_remarks);end if;
 if auth.uid() is null or not public.current_user_has_role(array['Accounts']) then raise exception 'Only Accounts can financially verify and decide a charge request';end if;
 if coalesce(r.approval_status,'Pending')<>'Pending' then raise exception 'This request has already been decided';end if;
 if decision='Rejected' then return public.decide_bill_charge_request_before_patient_physio(p_request_id,p_decision,p_approved_amount,p_remarks);end if;
 if decision<>'Approved' then raise exception 'Approve the agreed patient rate or reject for review';end if;
 if p_approved_amount is null or p_approved_amount is distinct from r.unit_cost or p_approved_amount<=0 then raise exception 'Verified amount must match this patient’s Admin-approved session rate of %',r.unit_cost;end if;
 if not exists(select 1 from public.physiotherapy_sessions where id=r.physiotherapy_session_id and status='Completed' and patient_id=r.patient_id and charge_request_id=r.id) then raise exception 'Completed session link needs review';end if;
 select coalesce(nullif(full_name,''),'Accounts') into staff_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
 insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
 values(r.patient_id,'Charge','Physiotherapy',p_approved_amount,'Not applicable',r.description||' · Patient-specific Admin-approved rate · Accounts verified by: '||coalesce(staff_name,'Accounts'),now(),auth.uid()) returning id into tid;
 update public.bill_charge_requests set final_amount=p_approved_amount,approved_amount=p_approved_amount,approval_status='Approved',status='Posted',approved_by=auth.uid(),approved_at=now(),decision_date=now(),decision_by_name=staff_name,decision_by_role='Accounts',approval_remarks=p_remarks,billing_transaction_id=tid,updated_at=now() where id=r.id;
 return jsonb_build_object('success',true,'decision','Approved','request_id',r.id,'approved_amount',p_approved_amount,'billing_transaction_id',tid);
end $$;
revoke all on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) from public,anon;
grant execute on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) to authenticated;
commit;
notify pgrst,'reload schema';
