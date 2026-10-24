-- 285 — Physiotherapist panel: Salary or Session-fee physiotherapists (Samara own team), physiotherapist-wise statements,
-- session details for Session Counts. Run once in Supabase SQL Editor after 284. Safe to re-run.
begin;
alter table public.physio_practitioners add column if not exists pay_basis text not null default 'Session fee';
alter table public.physio_practitioners add column if not exists monthly_salary numeric(12,2);
do $$begin
 if not exists(select 1 from pg_constraint where conname='physio_practitioner_pay_basis_check') then
  alter table public.physio_practitioners add constraint physio_practitioner_pay_basis_check check(pay_basis in ('Salary','Session fee'));end if;
end $$;
-- Samara own physiotherapists without a session fee are salaried until Admin says otherwise.
update public.physio_practitioners p set pay_basis='Salary' from public.physio_organisations o
 where o.id=p.organisation_id and o.org_type='Samara' and p.default_fee is null and p.pay_basis<>'Salary';

create or replace function public.physio_accounts(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare org public.physio_organisations%rowtype; practitioner public.physio_practitioners%rowtype;
 s public.physiotherapy_sessions%rowtype; entry public.physio_supplier_ledger%rowtype;
 oid uuid; pid uuid; sid uuid; eid uuid; key uuid; value numeric(12,2); day date; firstday date; lastday date;
 snapshot jsonb; method text; prid uuid;
begin
 if not public.current_user_has_role(array['Admin']) then raise exception 'Admin-only physiotherapy accounts';end if;
 oid:=nullif(p_data->>'organisation_id','')::uuid;
 if p_action='load' then
   firstday:=coalesce((p_data->>'from')::date,date_trunc('month',now() at time zone 'Asia/Kolkata')::date);
   lastday:=coalesce((p_data->>'to')::date,(now() at time zone 'Asia/Kolkata')::date);
   if firstday>lastday then raise exception 'Invalid period';end if;
   prid:=nullif(p_data->>'practitioner_id','')::uuid; -- SQL 285: physiotherapist-wise statement
   return jsonb_build_object(
     'organisations',coalesce((select jsonb_agg(to_jsonb(o) order by o.name) from public.physio_organisations o),'[]'),
     'practitioners',coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name) from public.physio_practitioners p where p.organisation_id=oid),'[]'),
     'unposted',coalesce((select count(*) from public.physiotherapy_sessions x join public.physio_organisations o on o.id=oid where (o.org_type='Outsourced' or exists(select 1 from public.physio_practitioners pf where pf.organisation_id=oid and pf.pay_basis='Session fee' and (pf.id=x.practitioner_id or (x.practitioner_id is null and lower(trim(pf.full_name))=lower(trim(coalesce(x.physiotherapist_name,''))))))) and x.organisation_id=oid and x.status='Completed' and x.session_date<=lastday and not exists(select 1 from public.physio_supplier_ledger l where l.session_id=x.id and l.kind='Session fee' and l.reversed_at is null)),0),
     'opening',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.organisation_id=oid and (prid is null or l.practitioner_id=prid) and l.entry_date<firstday),0),
     'balance',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.organisation_id=oid and (prid is null or l.practitioner_id=prid)),0),
     'entries',coalesce((select jsonb_agg(to_jsonb(l) order by l.entry_date,l.voucher_number) from public.physio_supplier_ledger l where l.organisation_id=oid and (prid is null or l.practitioner_id=prid) and l.entry_date between firstday and lastday),'[]'),
     'practitioner_balances',coalesce((select jsonb_agg(jsonb_build_object('practitioner_id',pr.id,'balance',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.practitioner_id=pr.id),0))) from public.physio_practitioners pr where pr.organisation_id=oid),'[]'),
     'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.session_date,'time',x.scheduled_time,'actual_time',x.actual_time,'physiotherapy_name',coalesce(o.name,x.physiotherapist_name),'physiotherapist_name',x.physiotherapist_name,'practitioner_id',x.practitioner_id,'patient_name',concat_ws(' ',p.title,p.full_name),'resident_id',p.patient_id,'room',concat_ws('-',p.room_no,p.bed_no),'notes',x.notes) order by x.session_date,x.created_at)
       from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id
       join public.physio_organisations o on o.id=oid
       where (o.org_type='Outsourced' or exists(select 1 from public.physio_practitioners pf where pf.organisation_id=oid and pf.pay_basis='Session fee' and (pf.id=x.practitioner_id or (x.practitioner_id is null and lower(trim(pf.full_name))=lower(trim(coalesce(x.physiotherapist_name,''))))))) and x.status='Completed' and x.session_date between firstday and lastday
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
   if coalesce(p_data->>'pay_basis','Session fee') not in ('Salary','Session fee') then raise exception 'Choose Salary or Session fee';end if;
   if org.org_type='Outsourced' and coalesce(p_data->>'pay_basis','Session fee')='Salary' then raise exception 'Outsourced physiotherapists are paid per session through their organisation';end if;
   if org.org_type='Samara' and coalesce(p_data->>'pay_basis','Session fee')='Session fee' and value is null then raise exception 'Enter the session fee for this Samara physiotherapist';end if;
   if exists(select 1 from public.physio_practitioners where id=pid and organisation_id<>oid) then raise exception 'Physiotherapist belongs to another organisation';end if;
   if exists(select 1 from public.physio_supplier_ledger where practitioner_id=pid) and exists(select 1 from public.physio_practitioners where id=pid and full_name<>trim(p_data->>'full_name')) then raise exception 'Keep the name once fees exist';end if;
   insert into public.physio_practitioners(id,organisation_id,full_name,phone,qualification,is_active,default_fee,pay_basis,monthly_salary)
   values(pid,oid,trim(p_data->>'full_name'),p_data->>'phone',p_data->>'qualification',coalesce((p_data->>'is_active')::boolean,true),case when coalesce(p_data->>'pay_basis','Session fee')='Salary' then null else value end,coalesce(p_data->>'pay_basis','Session fee'),nullif(trim(coalesce(p_data->>'monthly_salary','')),'')::numeric)
   on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,qualification=excluded.qualification,is_active=excluded.is_active,default_fee=excluded.default_fee,pay_basis=excluded.pay_basis,monthly_salary=excluded.monthly_salary;
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
   pid:=nullif(p_data->>'practitioner_id','')::uuid;sid:=nullif(p_data->>'session_id','')::uuid;
   select * into practitioner from public.physio_practitioners where id=pid and organisation_id=oid and is_active;
   if not found then raise exception 'Select the attending physiotherapist';end if;
   if practitioner.pay_basis='Salary' then raise exception '% is on salary — no session fee is posted',practitioner.full_name;end if;
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
   prid:=nullif(p_data->>'practitioner_id','')::uuid;
   if prid is not null and not exists(select 1 from public.physio_practitioners where id=prid and organisation_id=oid) then raise exception 'Physiotherapist belongs to another organisation';end if;
   if org.org_type='Samara' and prid is null then raise exception 'Choose the Samara physiotherapist this payment is for';end if;
   insert into public.physio_supplier_ledger(organisation_id,practitioner_id,entry_date,kind,amount,method,reference,recipient,notes,snapshot,created_by,request_key,request_data)
   values(oid,prid,day,case when p_action='payment' then 'Payment' else 'Refund' end,case when p_action='payment' then -value else value end,method,p_data->>'reference',p_data->>'recipient',p_data->>'notes',jsonb_build_object('organisation',org.name,'physiotherapist',(select full_name from public.physio_practitioners where id=prid)),auth.uid(),key,p_data) returning id into eid;
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

-- Every session of the period with Guest, charge and fee status (Session Counts row → full details).
drop function if exists public.physio_session_details(date,date);
create or replace function public.physio_session_details(p_from date,p_to date) returns table(
 session_id uuid,patient_id uuid,session_date date,scheduled_time time,actual_time time,status text,reason text,notes text,
 organisation text,org_type text,physiotherapist text,pay_basis text,guest_name text,guest_id text,room text,
 guest_charge numeric,guest_charge_status text,fee_amount numeric,recorded_by text,recorded_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare money_ok boolean:=public.current_user_has_role(array['Admin','Accounts']);
begin
 if not public.current_user_has_role(array['Admin','Accounts','Nurse','Caregiver','Manager']) then raise exception 'Physiotherapy access required';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid period';end if;
 return query
 select x.id,x.patient_id,x.session_date,x.scheduled_time,x.actual_time,x.status,x.reason,x.notes,
   coalesce(o.name,'Unassigned'),o.org_type,coalesce(nullif(trim(x.physiotherapist_name),''),'Not recorded'),pr.pay_basis,
   concat_ws(' ',p.title,p.full_name),p.patient_id,concat_ws('-',p.room_no,p.bed_no),
   case when money_ok then coalesce(b.final_amount,b.requested_amount) end,
   case when x.charge_request_id is null then null else coalesce(b.approval_status,'Pending') end,
   case when money_ok then f.amount end,
   (select coalesce(nullif(pf.full_name,''),'Staff') from public.profiles pf where pf.id=x.performed_by or pf.auth_user_id=x.performed_by limit 1),
   coalesce(x.updated_at,x.created_at)
 from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id
 left join public.physio_organisations o on o.id=x.organisation_id
 left join lateral(select q.pay_basis from public.physio_practitioners q where q.id=x.practitioner_id or (x.practitioner_id is null and q.organisation_id=x.organisation_id and lower(trim(q.full_name))=lower(trim(coalesce(x.physiotherapist_name,'')))) order by (q.id=x.practitioner_id) desc limit 1) pr on true
 left join public.bill_charge_requests b on b.id=x.charge_request_id
 left join public.physio_supplier_ledger f on f.session_id=x.id and f.kind='Session fee' and f.reversed_at is null
 where x.session_date between p_from and p_to
 order by x.session_date desc,x.scheduled_time nulls last;
end $$;
revoke all on function public.physio_session_details(date,date) from public,anon;
grant execute on function public.physio_session_details(date,date) to authenticated;
commit;
notify pgrst,'reload schema';
select o.name as organisation,o.org_type,p.full_name,p.pay_basis,p.default_fee as session_fee,p.monthly_salary from public.physio_practitioners p join public.physio_organisations o on o.id=p.organisation_id order by 1,3;
