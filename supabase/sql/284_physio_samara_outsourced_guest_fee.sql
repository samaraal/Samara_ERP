-- 284 — Physiotherapy: Samara own vs Outsourced physiotherapists, chargeable Guest fee, unbilled alerts.
-- Run once in Supabase SQL Editor. Safe to re-run. Front end 2.18.106 works before and after this script.
--  • physio_organisations.org_type  'Samara' (own staff, salaried → no therapist fee ledger) | 'Outsourced'
--  • physio_organisations.guest_fee  chargeable fee to the Guest per completed session (both types)
--  • Guest price = Guest-specific agreed rate (if set) → else the organisation's Guest fee → else waits (alert after 24 h)
begin;
alter table public.physio_organisations add column if not exists org_type text not null default 'Outsourced';
alter table public.physio_organisations add column if not exists guest_fee numeric(12,2);
do $$begin
 if not exists(select 1 from pg_constraint where conname='physio_org_type_check') then
  alter table public.physio_organisations add constraint physio_org_type_check check(org_type in ('Samara','Outsourced'));end if;
 if not exists(select 1 from pg_constraint where conname='physio_org_guest_fee_check') then
  alter table public.physio_organisations add constraint physio_org_guest_fee_check check(guest_fee is null or (guest_fee>0 and guest_fee::text<>'NaN'));end if;
end $$;
-- Organisations named "Samara …" are Samara's own physiotherapists. Admin can change the type later.
update public.physio_organisations set org_type='Samara' where lower(trim(name)) like 'samara%' and org_type<>'Samara'
 and not exists(select 1 from public.physio_supplier_ledger l where l.organisation_id=physio_organisations.id and l.kind='Session fee');
alter table public.bill_charge_requests add column if not exists physio_org_tariff_id uuid references public.physio_organisations(id);

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
 if found then price:=r.amount;source:='Guest agreed rate effective '||r.effective_from;
 else
   -- SQL 284: no Guest-specific rate → the organisation's chargeable Guest fee (Samara own or outsourced).
   select * into o from public.physio_organisations where id=coalesce(s.organisation_id,(select pr.organisation_id from public.physio_practitioners pr where pr.id=s.practitioner_id));
   if o.id is null or o.guest_fee is null or o.guest_fee<=0 then return null;end if;
   price:=o.guest_fee;source:=o.name||' Guest fee ('||o.org_type||')';
 end if;
 actor:=coalesce(auth.uid(),s.performed_by);
 select coalesce(nullif(full_name,''),'Staff') into actor_name from public.profiles where id=actor or auth_user_id=actor limit 1;
 insert into public.bill_charge_requests(patient_id,charge_date,service_datetime,category,service_code,service_name,service_provider,description,quantity,unit,unit_cost,estimated_amount,requested_amount,billable,bill_available,urgency,status,approval_status,remarks,raised_by,raised_by_name,physiotherapy_session_id,patient_physio_rate_id,physio_org_tariff_id)
 values(s.patient_id,s.session_date,coalesce(s.session_at,s.session_date::timestamp at time zone 'Asia/Kolkata'),'Physiotherapy','PATIENT_PHYSIO_SESSION','Regular Physiotherapy Session',s.physiotherapist_name,'Physiotherapy session on '||s.session_date||' · '||coalesce(s.notes,'Completed session'),1,'Session',price,price,price,true,false,'Routine','Raised','Pending',source,actor,coalesce(actor_name,'Staff'),s.id,r.id,o.id) returning id into request_id;
 update public.physiotherapy_sessions set billable=true,billing_rate=price,charge_request_id=request_id,updated_at=now() where id=s.id;
 perform public.record_audit_event('Physiotherapy Patient Charge Requested','Physiotherapy',s.id::text,jsonb_build_object('request_id',request_id,'rate_id',r.id,'organisation_tariff_id',o.id,'amount',price,'source',source),'Success');
 return request_id;
end $$;
revoke all on function public.queue_patient_physio_charge(uuid) from public,anon,authenticated;

create or replace function public.guard_patient_physio_charge() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype;r public.patient_physio_rates%rowtype;o public.physio_organisations%rowtype;
begin
 if tg_op='UPDATE' and old.physiotherapy_session_id is not null then
  if row(new.physiotherapy_session_id,new.patient_physio_rate_id,new.physio_org_tariff_id,new.patient_id,new.charge_date,new.category,new.service_name,new.quantity,new.unit_cost,new.requested_amount,new.billable,new.bill_available)
     is distinct from row(old.physiotherapy_session_id,old.patient_physio_rate_id,old.physio_org_tariff_id,old.patient_id,old.charge_date,old.category,old.service_name,old.quantity,old.unit_cost,old.requested_amount,old.billable,old.bill_available) then
    raise exception 'Linked physiotherapy session and agreed rate are fixed. Accounts must review the existing request; do not change its source or price';end if;
 end if;
 if new.physiotherapy_session_id is null then
  if new.patient_physio_rate_id is not null or new.physio_org_tariff_id is not null then raise exception 'Physiotherapy rate needs a completed-session link';end if;
  return new;
 end if;
 select * into s from public.physiotherapy_sessions where id=new.physiotherapy_session_id;
 select * into r from public.patient_physio_rates where id=new.patient_physio_rate_id;
 if tg_op='UPDATE' and old.physiotherapy_session_id is not null then return new;end if; -- source/price fixed above; decision updates pass
 if new.patient_physio_rate_id is null then
   select * into o from public.physio_organisations where id=new.physio_org_tariff_id;
   if o.id is null or o.guest_fee is null or new.unit_cost is distinct from o.guest_fee then raise exception 'Physiotherapy request must match the organisation Guest fee';end if;
 elsif r.id is null or r.patient_id<>s.patient_id or r.effective_from>s.session_date or new.unit_cost is distinct from r.amount then
   raise exception 'Physiotherapy request must match the Admin-approved Guest rate';end if;
 if s.id is null or s.status<>'Completed' or s.patient_id<>new.patient_id or s.session_date<>new.charge_date
 or new.category<>'Physiotherapy' or new.quantity is distinct from 1::numeric or new.requested_amount is distinct from new.unit_cost or not new.billable or new.bill_available then
 raise exception 'Physiotherapy request must match the completed session and its approved rate';end if;
 return new;
end $$;
revoke all on function public.guard_patient_physio_charge() from public,anon,authenticated;

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
 if p_approved_amount is null or p_approved_amount is distinct from r.unit_cost or p_approved_amount<=0 then raise exception 'Verified amount must match this Guest’s physiotherapy rate of %',r.unit_cost;end if;
 if not exists(select 1 from public.physiotherapy_sessions where id=r.physiotherapy_session_id and status='Completed' and patient_id=r.patient_id and charge_request_id=r.id) then raise exception 'Completed session link needs review';end if;
 select coalesce(nullif(full_name,''),'Accounts') into staff_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
 insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
 values(r.patient_id,'Charge','Physiotherapy',p_approved_amount,'Not applicable',r.description||' · '||case when r.patient_physio_rate_id is not null then 'Guest agreed rate' else 'Physiotherapy Guest fee' end||' · Accounts verified by: '||coalesce(staff_name,'Accounts'),now(),auth.uid()) returning id into tid;
 update public.bill_charge_requests set final_amount=p_approved_amount,approved_amount=p_approved_amount,approval_status='Approved',status='Posted',approved_by=auth.uid(),approved_at=now(),decision_date=now(),decision_by_name=staff_name,decision_by_role='Accounts',approval_remarks=p_remarks,billing_transaction_id=tid,updated_at=now() where id=r.id;
 return jsonb_build_object('success',true,'decision','Approved','request_id',r.id,'approved_amount',p_approved_amount,'billing_transaction_id',tid);
end $$;
revoke all on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) from public,anon;
grant execute on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) to authenticated;

create or replace function public.patient_physio_billing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid;day date;price numeric;rid uuid;queued_session record;queued integer:=0;request_id uuid;next_day date;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts']) then raise exception 'Admin or Accounts access required';end if;
 if p_action='load' then
 return jsonb_build_object(
 'clinical_approval_required',public.charge_category_requires_approval('Physiotherapy'),
 'organisations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'org_type',o.org_type,'guest_fee',o.guest_fee,'is_active',o.is_active) order by o.name) from public.physio_organisations o),'[]'),
 'patients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'patient_id',p.patient_id,'admission_date',p.admission_date) order by p.full_name) from public.patients p where p.is_active is true and coalesce(p.admission_status,'')<>'Discharged' and (exists(select 1 from public.physiotherapy_plans x where x.patient_id=p.id) or exists(select 1 from public.physiotherapy_sessions x where x.patient_id=p.id))),'[]'),
 'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_from desc) from public.patient_physio_rates r),'[]'),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'patient_id',s.patient_id,'session_date',s.session_date,'notes',s.notes,'physiotherapist',s.physiotherapist_name,'request_id',s.charge_request_id,'billing_rate',s.billing_rate,'organisation_id',s.organisation_id,'fee_source',case when b.patient_physio_rate_id is not null then 'Guest rate' when b.physio_org_tariff_id is not null then 'Organisation Guest fee' end,'overdue',(s.charge_request_id is null and coalesce(s.session_at,s.session_date::timestamp at time zone 'Asia/Kolkata')<now()-interval '24 hours'),'approval_status',b.approval_status,'amount',coalesce(b.final_amount,b.requested_amount),'manual_charge_exists',exists(select 1 from public.bill_charge_requests x where x.patient_id=s.patient_id and x.category='Physiotherapy' and x.charge_date=s.session_date and x.physiotherapy_session_id is null and coalesce(x.approval_status,'Pending')<>'Rejected')) order by s.session_date desc) from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id left join public.bill_charge_requests b on b.id=s.charge_request_id where p.is_active is true and coalesce(p.admission_status,'')<>'Discharged' and s.status='Completed' and s.session_date<=(now() at time zone 'Asia/Kolkata')::date),'[]'));
 end if;
 if p_action='queue_pending' then
   -- SQL 284: send every unbilled completed session that now has a rate / Guest fee to Accounts.
   for queued_session in select x.id from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id where x.status='Completed' and x.charge_request_id is null and p.is_active is true and coalesce(p.admission_status,'')<>'Discharged' and x.session_date<=(now() at time zone 'Asia/Kolkata')::date order by x.session_date,x.id loop
     request_id:=public.queue_patient_physio_charge(queued_session.id);if request_id is not null then queued:=queued+1;end if;
   end loop;
   return jsonb_build_object('queued',queued);
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

create or replace function public.physio_accounts(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare org public.physio_organisations%rowtype; practitioner public.physio_practitioners%rowtype;
 s public.physiotherapy_sessions%rowtype; entry public.physio_supplier_ledger%rowtype;
 oid uuid; pid uuid; sid uuid; eid uuid; key uuid; value numeric(12,2); day date; firstday date; lastday date;
 snapshot jsonb; method text;
begin
 if not public.current_user_has_role(array['Admin']) then raise exception 'Admin-only physiotherapy accounts';end if;
 oid:=nullif(p_data->>'organisation_id','')::uuid;
 if p_action='load' then
   firstday:=coalesce((p_data->>'from')::date,date_trunc('month',now() at time zone 'Asia/Kolkata')::date);
   lastday:=coalesce((p_data->>'to')::date,(now() at time zone 'Asia/Kolkata')::date);
   if firstday>lastday then raise exception 'Invalid period';end if;
   return jsonb_build_object(
     'organisations',coalesce((select jsonb_agg(to_jsonb(o) order by o.name) from public.physio_organisations o),'[]'),
     'practitioners',coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name) from public.physio_practitioners p where p.organisation_id=oid),'[]'),
     'unposted',coalesce((select count(*) from public.physiotherapy_sessions x join public.physio_organisations o on o.id=oid where o.org_type='Outsourced' and x.organisation_id=oid and x.status='Completed' and x.session_date<=lastday and not exists(select 1 from public.physio_supplier_ledger l where l.session_id=x.id and l.kind='Session fee' and l.reversed_at is null)),0),
     'opening',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.organisation_id=oid and l.entry_date<firstday),0),
     'balance',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.organisation_id=oid),0),
     'entries',coalesce((select jsonb_agg(to_jsonb(l) order by l.entry_date,l.voucher_number) from public.physio_supplier_ledger l where l.organisation_id=oid and l.entry_date between firstday and lastday),'[]'),
     'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.session_date,'time',x.scheduled_time,'actual_time',x.actual_time,'physiotherapy_name',coalesce(o.name,x.physiotherapist_name),'physiotherapist_name',x.physiotherapist_name,'practitioner_id',x.practitioner_id,'patient_name',concat_ws(' ',p.title,p.full_name),'resident_id',p.patient_id,'room',concat_ws('-',p.room_no,p.bed_no),'notes',x.notes) order by x.session_date,x.created_at)
       from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id
       join public.physio_organisations o on o.id=oid
       where o.org_type='Outsourced' and x.status='Completed' and x.session_date between firstday and lastday
       and (x.organisation_id=oid or (x.organisation_id is null and (lower(trim(coalesce(x.physiotherapist_name,'')))=lower(trim(o.name)) or exists(select 1 from public.physio_practitioners pr where pr.organisation_id=oid and lower(trim(pr.full_name))=lower(trim(coalesce(x.physiotherapist_name,'')))))))
       and not exists(select 1 from public.physio_supplier_ledger l where l.session_id=x.id and l.kind='Session fee' and l.reversed_at is null)),'[]'));
 end if;
 if p_action='save_organisation' then
   oid:=coalesce(oid,gen_random_uuid());value:=coalesce((p_data->>'default_fee')::numeric,0);
   if nullif(trim(p_data->>'name'),'') is null or value<0 then raise exception 'Organisation name and non-negative rate required';end if;
   if coalesce(p_data->>'org_type','Outsourced') not in ('Samara','Outsourced') then raise exception 'Choose Samara (own staff) or Outsourced';end if;
   if nullif(trim(coalesce(p_data->>'guest_fee','')),'') is not null and ((p_data->>'guest_fee')::numeric<=0) then raise exception 'Guest fee must be a positive amount, or leave it blank';end if;
   if coalesce(p_data->>'org_type','Outsourced')='Outsourced' and value<=0 then raise exception 'Enter the fee paid to the outsourced physiotherapy organisation per session';end if;
   select * into org from public.physio_organisations where id=oid for update;
   if found then
     if org.name<>trim(p_data->>'name') and exists(select 1 from public.physio_supplier_ledger where organisation_id=oid) then raise exception 'Keep the organisation name once ledger entries exist';end if;
     update public.physio_organisations set name=trim(p_data->>'name'),contact_person=p_data->>'contact_person',phone=p_data->>'phone',email=p_data->>'email',address=p_data->>'address',gst_number=p_data->>'gst_number',payment_terms=p_data->>'payment_terms',default_fee=value,org_type=coalesce(p_data->>'org_type','Outsourced'),guest_fee=nullif(trim(coalesce(p_data->>'guest_fee','')),'')::numeric,is_active=coalesce((p_data->>'is_active')::boolean,true),updated_at=now() where id=oid;
   else
     insert into public.physio_organisations(id,name,contact_person,phone,email,address,gst_number,payment_terms,default_fee,is_active,org_type,guest_fee)
     values(oid,trim(p_data->>'name'),p_data->>'contact_person',p_data->>'phone',p_data->>'email',p_data->>'address',p_data->>'gst_number',p_data->>'payment_terms',value,coalesce((p_data->>'is_active')::boolean,true),coalesce(p_data->>'org_type','Outsourced'),nullif(trim(coalesce(p_data->>'guest_fee','')),'')::numeric);
     value:=coalesce((p_data->>'opening_amount')::numeric,0);
     if value<>0 then
       day:=coalesce((p_data->>'opening_date')::date,(now() at time zone 'Asia/Kolkata')::date);
       if day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Opening balance date cannot be future';end if;
       insert into public.physio_supplier_ledger(organisation_id,entry_date,kind,amount,notes,created_by,request_key,request_data)
       values(oid,day,'Opening',value,'Opening balance',auth.uid(),oid,p_data);
     end if;
   end if;
   perform public.record_audit_event('Physiotherapy Organisation Saved','Physiotherapy Accounts',oid::text,p_data,'Success');
   -- A new / changed Guest fee sends this organisation's unbilled completed sessions to Accounts.
   perform public.queue_patient_physio_charge(x.id) from public.physiotherapy_sessions x where x.organisation_id=oid and x.status='Completed' and x.charge_request_id is null;
   return jsonb_build_object('id',oid);
 end if;
 select * into org from public.physio_organisations where id=oid for update;
 if not found then raise exception 'Select an organisation';end if;
 if p_action='save_practitioner' then
   pid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   value:=case when p_data ? 'default_fee' then nullif(trim(p_data->>'default_fee'),'')::numeric else (select pr.default_fee from public.physio_practitioners pr where pr.id=pid and pr.organisation_id=oid) end;
   if value is not null and (value<=0 or value::text='NaN') then raise exception 'Enter a positive physiotherapist fee or leave blank to use the organisation default';end if;
   if nullif(trim(p_data->>'full_name'),'') is null then raise exception 'Physiotherapist name required';end if;
   if exists(select 1 from public.physio_practitioners where id=pid and organisation_id<>oid) then raise exception 'Physiotherapist belongs to another organisation';end if;
   if exists(select 1 from public.physio_supplier_ledger where practitioner_id=pid) and exists(select 1 from public.physio_practitioners where id=pid and full_name<>trim(p_data->>'full_name')) then raise exception 'Keep the name once fees exist';end if;
   insert into public.physio_practitioners(id,organisation_id,full_name,phone,qualification,is_active,default_fee)
   values(pid,oid,trim(p_data->>'full_name'),p_data->>'phone',p_data->>'qualification',coalesce((p_data->>'is_active')::boolean,true),value)
   on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,qualification=excluded.qualification,is_active=excluded.is_active,default_fee=excluded.default_fee;
   perform public.record_audit_event('Physiotherapist Saved','Physiotherapy Accounts',pid::text,p_data,'Success');return jsonb_build_object('id',pid);
 end if;
 key:=nullif(p_data->>'request_key','')::uuid;if key is null then raise exception 'Request key required';end if;
 select * into entry from public.physio_supplier_ledger where request_key=key;
 if found then
   if entry.request_data<>p_data or entry.kind<>(case p_action when 'post_fee' then 'Session fee' when 'payment' then 'Payment' when 'refund' then 'Refund' when 'reverse' then 'Reversal' else '' end) then raise exception 'This request already recorded different details. Reload before making another entry';end if;
   return jsonb_build_object('id',entry.id,'voucher',entry.voucher_number,'already_recorded',true);
 end if;
 if p_action='post_fee' then
   if not org.is_active then raise exception 'Organisation inactive';end if;
   if org.org_type='Samara' then raise exception 'Samara own physiotherapists are staff — no session fee is posted to a therapist account';end if;
   pid:=nullif(p_data->>'practitioner_id','')::uuid;sid:=nullif(p_data->>'session_id','')::uuid;
   select * into practitioner from public.physio_practitioners where id=pid and organisation_id=oid and is_active;
   if not found then raise exception 'Select the attending physiotherapist';end if;
   select * into s from public.physiotherapy_sessions where id=sid for update;
   if not found or s.status<>'Completed' or s.session_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Only actual completed sessions can be charged';end if;
   if (s.organisation_id is not null and s.organisation_id<>oid) or (s.organisation_id is null and lower(trim(coalesce(s.physiotherapist_name,''))) not in (lower(trim(org.name)),lower(trim(practitioner.full_name)))) then raise exception 'Session organisation/physiotherapist does not match';end if;
   if s.practitioner_id is not null and s.practitioner_id<>pid then raise exception 'Choose the physiotherapist recorded by the nurse; provider changes require session correction approval';end if;
   value:=coalesce(nullif(trim(p_data->>'rate'),'')::numeric,practitioner.default_fee,org.default_fee);if value is null or value<=0 or value::text='NaN' then raise exception 'Enter a positive per-session fee';end if;
   select jsonb_build_object('organisation',org.name,'physiotherapist',practitioner.full_name,'patient_id',p.id,'patient_name',concat_ws(' ',p.title,p.full_name),'resident_id',p.patient_id,'room',concat_ws('-',p.room_no,p.bed_no),'session_date',s.session_date,'session_time',s.scheduled_time,'actual_time',s.actual_time,'notes',s.notes) into snapshot from public.patients p where p.id=s.patient_id;
   insert into public.physio_supplier_ledger(organisation_id,practitioner_id,session_id,entry_date,kind,amount,rate,snapshot,created_by,request_key,request_data,notes)
   values(oid,pid,sid,s.session_date,'Session fee',value,value,snapshot,auth.uid(),key,p_data,p_data->>'notes') returning id into eid;
 elsif p_action in ('payment','refund') then
   value:=(p_data->>'amount')::numeric;day:=(p_data->>'entry_date')::date;method:=p_data->>'method';
   if value is null or value<=0 or day is null or day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Enter positive amount and actual payment date';end if;
   if method is null or method not in ('Bank transfer','UPI','Cheque','Cash','Other') then raise exception 'Select payment method';end if;
   if method='Cash' and nullif(trim(p_data->>'recipient'),'') is null then raise exception 'Enter cash recipient/payer';end if;
   if method<>'Cash' and nullif(trim(p_data->>'reference'),'') is null then raise exception 'Enter transaction reference';end if;
   insert into public.physio_supplier_ledger(organisation_id,entry_date,kind,amount,method,reference,recipient,notes,snapshot,created_by,request_key,request_data)
   values(oid,day,case when p_action='payment' then 'Payment' else 'Refund' end,case when p_action='payment' then -value else value end,method,p_data->>'reference',p_data->>'recipient',p_data->>'notes',jsonb_build_object('organisation',org.name),auth.uid(),key,p_data) returning id into eid;
 elsif p_action='reverse' then
   select * into entry from public.physio_supplier_ledger where id=(p_data->>'entry_id')::uuid and organisation_id=oid for update;
   if not found or entry.kind='Reversal' or entry.reversed_at is not null then raise exception 'Entry unavailable or already reversed';end if;
   if nullif(trim(p_data->>'reason'),'') is null then raise exception 'Reversal reason required';end if;
   insert into public.physio_supplier_ledger(organisation_id,practitioner_id,session_id,entry_date,kind,amount,notes,snapshot,reverses,created_by,request_key,request_data)
   values(oid,entry.practitioner_id,entry.session_id,(now() at time zone 'Asia/Kolkata')::date,'Reversal',-entry.amount,p_data->>'reason',entry.snapshot,entry.id,auth.uid(),key,p_data) returning id into eid;
   update public.physio_supplier_ledger set reversed_at=now(),reversed_by=auth.uid() where id=entry.id;
 else raise exception 'Unknown account action';end if;
 perform public.record_audit_event('Physiotherapy Account '||p_action,'Physiotherapy Accounts',eid::text,p_data,'Success');
 return (select jsonb_build_object('id',l.id,'voucher',l.voucher_number) from public.physio_supplier_ledger l where l.id=eid);
end $$;

revoke all on function public.physio_accounts(text,jsonb) from public,anon;
grant execute on function public.physio_accounts(text,jsonb) to authenticated;

-- Completed sessions not sent for Guest billing after 24 h (Admin / Accounts), with the reason.
create or replace function public.physio_unbilled_alerts() returns table(session_id uuid,patient_id uuid,guest_name text,session_date date,organisation text,reason text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.current_user_has_role(array['Admin','Accounts']) then return;end if;
 return query
 select x.id,x.patient_id,concat_ws(' ',p.title,p.full_name),x.session_date,o.name,
   case when public.charge_category_requires_approval('Physiotherapy') then 'Physiotherapy needs clinical approval (Approval Requests)'
        when exists(select 1 from public.bill_charge_requests b where b.patient_id=x.patient_id and b.category='Physiotherapy' and b.charge_date=x.session_date and b.physiotherapy_session_id is null and coalesce(b.approval_status,'Pending')<>'Rejected') then 'A manual physiotherapy charge exists for this date — reconcile'
        else 'No Guest rate and no organisation Guest fee' end
 from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id left join public.physio_organisations o on o.id=x.organisation_id
 where x.status='Completed' and x.charge_request_id is null and p.is_active is true and coalesce(p.admission_status,'')<>'Discharged'
   and coalesce(x.session_at,x.session_date::timestamp at time zone 'Asia/Kolkata')<now()-interval '24 hours'
 order by x.session_date,x.id;
end $$;
revoke all on function public.physio_unbilled_alerts() from public,anon;
grant execute on function public.physio_unbilled_alerts() to authenticated;

-- Whether a session is already charged to the Guest / its therapist fee is posted (corrections need these undone first).
create or replace function public.physio_session_locks(p_sessions uuid[]) returns table(session_id uuid,guest_charge text,fee_posted boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.current_user_has_role(array['Admin','Accounts','Manager','Nurse','Caregiver']) then return;end if;
 return query select x.id,
   case when x.charge_request_id is null then null else coalesce((select coalesce(b.approval_status,'Pending') from public.bill_charge_requests b where b.id=x.charge_request_id),'Pending') end,
   exists(select 1 from public.physio_supplier_ledger l where l.session_id=x.id and l.kind='Session fee' and l.reversed_at is null)
 from public.physiotherapy_sessions x where x.id=any(p_sessions);
end $$;
revoke all on function public.physio_session_locks(uuid[]) from public,anon;
grant execute on function public.physio_session_locks(uuid[]) to authenticated;
commit;
notify pgrst,'reload schema';
select o.name,o.org_type,o.default_fee as therapist_fee,o.guest_fee from public.physio_organisations o order by o.name;
