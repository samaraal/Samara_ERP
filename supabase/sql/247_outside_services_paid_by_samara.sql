-- Samara Care ERP 2.17.5 · Family Portal 1.0.40 — Outside Services paid by Samara
-- Bills Samara pays outside for a Guest (outside pharmacy, lab, scan, ambulance, taxi / auto,
-- hospital OPD / bill). ONE entry by the Nurse / Nursing Manager does everything:
--   • Bills & Charges → category "Outside Services": item, provider, bill no / date, bill amount,
--     bill photo / PDF (compulsory) and WHO PAID (NM Petty Cash, Admin / Director,
--     Samara Bank / UPI, On credit - pay later, Family paid directly).
--   • Accounts verifies the bill amount → Guest ledger gets the bill "at actual" plus a separate
--     "Handling charge" line (fee set per item in Charge Master: fixed ₹ or % of the bill).
--   • Paid from NM Petty Cash → the expense is written into her petty cash book automatically
--     (not for Trial Guests, so the real cash book stays clean).
--   • On credit → listed as payable until Accounts marks it paid. Family paid directly → kept for
--     the record only, never charged.
--   • Families see the original bill (View Bill) in the Family Portal.
-- Existing Bills & Charges approval for every other category is unchanged.
-- Run this whole file once in Supabase SQL Editor (after 246). Safe to run again.
begin;

-- 1. Columns -----------------------------------------------------------------------------------------
alter table public.bill_charge_requests
  add column if not exists outside_paid_by text,
  add column if not exists outside_route text,
  add column if not exists outside_bill_amount numeric(12,2),
  add column if not exists outside_handling_fee numeric(12,2),
  add column if not exists outside_fee_transaction_id uuid,
  add column if not exists outside_petty_entry_id uuid,
  add column if not exists outside_payable_status text,
  add column if not exists outside_settled_at timestamptz,
  add column if not exists outside_settled_by uuid,
  add column if not exists outside_settled_by_name text,
  add column if not exists outside_settle_date date,
  add column if not exists outside_settle_mode text,
  add column if not exists outside_settle_ref text;
create index if not exists bill_charge_outside_idx on public.bill_charge_requests(outside_payable_status) where outside_paid_by is not null;

alter table public.charge_tariff_master
  add column if not exists handling_fee_type text not null default 'None',
  add column if not exists handling_fee_value numeric(12,2) not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='charge_tariff_handling_fee_type_chk') then
    alter table public.charge_tariff_master add constraint charge_tariff_handling_fee_type_chk
      check (handling_fee_type in ('None','Fixed','Percent') and handling_fee_value>=0 and (handling_fee_type<>'Percent' or handling_fee_value<=100));
  end if;
end $$;

-- Long-lived links to the bill photo / PDF, shown to the family of THAT Guest only (via the RPC below).
create table if not exists public.outside_bill_family_files(
  request_id uuid not null references public.bill_charge_requests(id) on delete cascade,
  storage_path text not null,
  file_name text,
  signed_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(request_id,storage_path));
alter table public.outside_bill_family_files enable row level security;
revoke all on public.outside_bill_family_files from public,anon,authenticated;

-- 2. Charge Master items (category "Outside Services", codes OUT-xxxx) -----------------------------
do $$
declare items text[]:=array['Outside Pharmacy Purchase','Outside Lab Tests','Outside Scan / X-ray / ECG','Outside Ambulance','Outside Taxi / Auto','Hospital OPD / Consultation','Hospital Bill'];
 i int;n int;
begin
  select coalesce(max(substring(charge_code from '^OUT-(\d+)$')::int),0) into n from public.charge_tariff_master where charge_code ~ '^OUT-\d+$';
  for i in 1..array_length(items,1) loop
    if not exists(select 1 from public.charge_tariff_master where category='Outside Services' and lower(service_name)=lower(items[i])) then
      n:=n+1;
      insert into public.charge_tariff_master(category,service_name,amount,is_active,charge_code,handling_fee_type,handling_fee_value,updated_at)
      values('Outside Services',items[i],null,true,'OUT-'||lpad(n::text,4,'0'),'None',0,now());
    end if;
  end loop;
end $$;
-- The same two items under Hospital Visits would bypass the fee / payables: turned OFF here
-- (Admin can turn them back ON in Charge Master; nothing already raised is changed).
update public.charge_tariff_master set is_active=false,updated_at=now()
 where category='Hospital Visits' and service_name in ('Hospital Bill Paid by Samara','Outside Pharmacy Purchase') and is_active;
-- Outside Services are always raised from Bills & Charges (never Approval Requests).
do $$ begin
  if to_regclass('public.charge_category_settings') is not null then
    insert into public.charge_category_settings(category,requires_approval) values('Outside Services',false)
    on conflict (category) do update set requires_approval=false;
  end if;
end $$;

-- 3. Guard on raising: bill, amount and who paid are compulsory -------------------------------------
create or replace function public.guard_outside_service_charge()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare code text;
begin
  if new.category is distinct from 'Outside Services' then
    if TG_OP='INSERT' then new.outside_paid_by:=null; end if;
    return new;
  end if;
  if TG_OP='UPDATE' then
    if old.category='Outside Services' and (new.outside_paid_by is distinct from old.outside_paid_by) and coalesce(old.approval_status,'Pending')<>'Pending' then
      raise exception 'Who paid cannot be changed after Accounts has decided this outside bill.';
    end if;
    return new;
  end if;
  if new.outside_paid_by not in ('NM Petty Cash','Admin / Director','Samara Bank / UPI','On credit - pay later','Family paid directly') then
    raise exception 'Outside Services: choose who paid the bill.';
  end if;
  if not coalesce(new.bill_available,false) or nullif(trim(coalesce(new.bill_number,'')),'') is null or new.bill_date is null then
    raise exception 'Outside Services: the bill is compulsory — enter the bill number and bill date and upload the bill.';
  end if;
  if coalesce(new.requested_amount,0)<=0 then raise exception 'Outside Services: enter the bill amount.'; end if;
  if nullif(trim(coalesce(new.service_provider,'')),'') is null then raise exception 'Outside Services: enter the shop / lab / hospital / vehicle that issued the bill.'; end if;
  new.quantity:=1;
  new.unit_cost:=new.requested_amount;
  new.estimated_amount:=new.requested_amount;
  new.outside_bill_amount:=new.requested_amount;
  new.paid_by_samara:=new.outside_paid_by<>'Family paid directly';
  new.outside_payable_status:=case new.outside_paid_by when 'On credit - pay later' then 'Payable' when 'Family paid directly' then 'Not applicable' else 'Paid' end;
  if new.charge_item_code is null then
    select charge_code into code from public.charge_tariff_master
     where category='Outside Services' and service_name=new.service_name and is_active limit 1;
    new.charge_item_code:=code;
  end if;
  return new;
end $$;
revoke all on function public.guard_outside_service_charge() from public,anon,authenticated;
drop trigger if exists outside_service_charge_guard on public.bill_charge_requests;
create trigger outside_service_charge_guard before insert or update on public.bill_charge_requests
  for each row execute function public.guard_outside_service_charge();

-- 4. Accounts approval: bill at actual + handling charge + petty cash / payable ---------------------
do $$begin
  if to_regprocedure('public.decide_bill_charge_request_before_outside(uuid,text,numeric,text)') is null then
    alter function public.decide_bill_charge_request_v5(uuid,text,numeric,text) rename to decide_bill_charge_request_before_outside;
  end if;
end $$;
revoke all on function public.decide_bill_charge_request_before_outside(uuid,text,numeric,text) from public,anon,authenticated;

create or replace function public.outside_handling_fee(p_request public.bill_charge_requests,p_bill numeric)
returns numeric language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select case t.handling_fee_type when 'Fixed' then t.handling_fee_value
                                                  when 'Percent' then round(p_bill*t.handling_fee_value/100,2) else 0 end
     from public.charge_tariff_master t
    where t.category='Outside Services' and t.is_active
      and ((p_request.charge_item_code is not null and t.charge_code=p_request.charge_item_code) or t.service_name=p_request.service_name)
    order by (p_request.charge_item_code is not null and t.charge_code=p_request.charge_item_code) desc
    limit 1),0)
$$;
revoke all on function public.outside_handling_fee(public.bill_charge_requests,numeric) from public,anon;
grant execute on function public.outside_handling_fee(public.bill_charge_requests,numeric) to authenticated;

create or replace function public.decide_bill_charge_request_v5(p_request_id uuid,p_decision text,p_approved_amount numeric default 0,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype; d text:=trim(p_decision); v_pid uuid; v_role text; v_name text;
 fee numeric:=0; tid uuid; fid uuid; eid uuid; label text; guest text; trial boolean:=false;
begin
  select * into r from public.bill_charge_requests where id=p_request_id for update;
  if not found or r.outside_paid_by is null then
    return public.decide_bill_charge_request_before_outside(p_request_id,p_decision,p_approved_amount,p_remarks);
  end if;
  select id,role,coalesce(nullif(full_name,''),'Accounts') into v_pid,v_role,v_name
    from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role is distinct from 'Accounts' then raise exception 'Only Accounts can financially verify and decide a charge request.'; end if;
  if coalesce(r.approval_status,'Pending')<>'Pending' then raise exception 'This request has already been decided.'; end if;
  if d='Rejected' then
    update public.bill_charge_requests set approval_status='Rejected',status='Rejected',final_amount=0,
      outside_payable_status='Not applicable',approval_remarks=p_remarks,approved_by=auth.uid(),approved_at=now(),decision_date=now(),
      decision_by_name=v_name,decision_by_role=v_role,updated_at=now() where id=r.id;
    return jsonb_build_object('success',true,'decision','Rejected','request_id',r.id);
  end if;
  if d not in ('Approved','Partially Approved') then raise exception 'Invalid decision.'; end if;
  if coalesce(p_approved_amount,0)<=0 then raise exception 'Enter the verified bill amount.'; end if;
  if r.bill_number is null or r.bill_date is null then raise exception 'Bill number and bill date are mandatory for outside bills.'; end if;
  label:=coalesce(nullif(trim(r.service_name),''),nullif(trim(r.description),''),'Outside service');
  select patient_id,coalesce(is_trial,false) into guest,trial from public.patients where id=r.patient_id;

  if r.outside_paid_by='Family paid directly' then
    -- record only: nothing charged, nothing paid by Samara
    update public.bill_charge_requests set approval_status=d,status='Recorded',final_amount=0,approved_amount=0,
      outside_bill_amount=p_approved_amount,outside_handling_fee=0,outside_payable_status='Not applicable',
      approved_by=auth.uid(),approved_at=now(),decision_date=now(),decision_by_name=v_name,decision_by_role=v_role,
      approval_remarks=p_remarks,updated_at=now() where id=r.id;
    perform public.record_audit_event('Outside Bill Recorded (Family Paid)','Bills & Charges',r.id::text,jsonb_build_object('bill_amount',p_approved_amount),'Success');
    return jsonb_build_object('success',true,'decision',d,'request_id',r.id,'approved_amount',0,'family_paid',true);
  end if;

  fee:=public.outside_handling_fee(r,p_approved_amount);
  insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
  values(r.patient_id,'Charge','Outside Services',p_approved_amount,'Not applicable',
    concat(label,' (at actual) · Bill: ',r.bill_number,' · ',coalesce(r.service_provider,''),' · Paid by Samara: ',r.outside_paid_by,
           ' · Accounts verified by: ',v_name,case when p_remarks is not null then ' · Remarks: '||p_remarks else '' end),now(),auth.uid())
  returning id into tid;
  if fee>0 then
    insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
    values(r.patient_id,'Charge','Outside Services',fee,'Not applicable',concat('Handling charge - ',label,' · Bill: ',r.bill_number,' · Accounts verified by: ',v_name),now(),auth.uid())
    returning id into fid;
  end if;
  if r.outside_paid_by='NM Petty Cash' and not trial and to_regclass('public.nm_petty_cash_entries') is not null then
    perform pg_advisory_xact_lock(hashtext('samara_nm_petty_cash'));
    eid:=gen_random_uuid();
    insert into public.nm_petty_cash_entries(id,kind,amount,entry_date,details,paid_to,bill_no,reference_id,actor,actor_name,review_status)
    values(eid,'Expense',-p_approved_amount,least(coalesce(r.bill_date,r.charge_date),(now() at time zone 'Asia/Kolkata')::date),
      concat('Outside bill for Guest ',coalesce(guest,'—'),' · ',label,' (auto from Bills & Charges; raised by ',coalesce(r.raised_by_name,'staff'),')'),
      r.service_provider,r.bill_number,r.id,v_pid,v_name,'Pending review');
  end if;
  update public.bill_charge_requests set final_amount=p_approved_amount+fee,approved_amount=p_approved_amount+fee,
    outside_bill_amount=p_approved_amount,outside_handling_fee=fee,outside_fee_transaction_id=fid,outside_petty_entry_id=eid,
    approval_status=d,status='Posted',approved_by=auth.uid(),approved_at=now(),decision_date=now(),decision_by_name=v_name,
    decision_by_role=v_role,approval_remarks=p_remarks,billing_transaction_id=tid,updated_at=now() where id=r.id;
  perform public.record_audit_event('Outside Bill Verified','Bills & Charges',r.id::text,
    jsonb_build_object('bill_amount',p_approved_amount,'handling_fee',fee,'paid_by',r.outside_paid_by,'billing_transaction_id',tid,'fee_transaction_id',fid,'petty_entry_id',eid),'Success');
  return jsonb_build_object('success',true,'decision',d,'request_id',r.id,'approved_amount',p_approved_amount+fee,
    'bill_amount',p_approved_amount,'handling_fee',fee,'billing_transaction_id',tid);
end $$;
revoke all on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) from public,anon;
grant execute on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) to authenticated;

-- 5. Credit bills: Accounts / Admin mark them paid --------------------------------------------------
create or replace function public.outside_bill_settle(p_request_id uuid,p_date date,p_mode text,p_ref text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype; v_pid uuid; v_name text;
begin
  if not public.current_user_has_role(array['Accounts','Admin']) then raise exception 'Accounts or Admin only.'; end if;
  select id,coalesce(nullif(full_name,''),'Accounts') into v_pid,v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  select * into r from public.bill_charge_requests where id=p_request_id for update;
  if not found or r.outside_paid_by is null then raise exception 'Outside bill not found.'; end if;
  if r.outside_payable_status<>'Payable' then raise exception 'This bill is not waiting for payment.'; end if;
  if r.approval_status not in ('Approved','Partially Approved') then raise exception 'Accounts must verify the bill before marking it paid.'; end if;
  if p_date is null or p_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Enter the payment date (not in the future).'; end if;
  if p_mode not in ('Cash','UPI','Bank transfer','Cheque') then raise exception 'Choose how it was paid.'; end if;
  update public.bill_charge_requests set outside_payable_status='Paid',outside_settle_date=p_date,outside_settle_mode=p_mode,
    outside_settle_ref=nullif(trim(coalesce(p_ref,'')),''),outside_settled_at=now(),outside_settled_by=v_pid,outside_settled_by_name=v_name,updated_at=now()
   where id=r.id;
  perform public.record_audit_event('Outside Bill Paid to Vendor','Bills & Charges',r.id::text,jsonb_build_object('date',p_date,'mode',p_mode,'reference',p_ref),'Success');
  return jsonb_build_object('success',true,'request_id',r.id);
end $$;
revoke all on function public.outside_bill_settle(uuid,date,text,text) from public,anon;
grant execute on function public.outside_bill_settle(uuid,date,text,text) to authenticated;

-- 6. Bill links for the Family Portal (saved by staff from the ERP) --------------------------------
create or replace function public.outside_bill_save_family_links(p_request_id uuid,p_links jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype; x jsonb; n int:=0;
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']) then raise exception 'Staff only.'; end if;
  select * into r from public.bill_charge_requests where id=p_request_id;
  if not found or r.outside_paid_by is null then raise exception 'Outside bill not found.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_links,'[]'::jsonb)) loop
    if not exists(select 1 from public.patient_documents d where d.patient_id=r.patient_id and d.storage_path=x->>'path') then continue; end if;
    if coalesce(x->>'url','') !~ '^https://' then continue; end if;
    insert into public.outside_bill_family_files(request_id,storage_path,file_name,signed_url,expires_at)
    values(r.id,x->>'path',x->>'name',x->>'url',coalesce((x->>'expires_at')::timestamptz,now()+interval '365 days'))
    on conflict (request_id,storage_path) do update set signed_url=excluded.signed_url,expires_at=excluded.expires_at,file_name=excluded.file_name;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.outside_bill_save_family_links(uuid,jsonb) from public,anon;
grant execute on function public.outside_bill_save_family_links(uuid,jsonb) to authenticated;

-- Which outside bills still need a family link (ERP fills these in the background)
create or replace function public.outside_bill_files_needing_links()
returns table(request_id uuid,patient_id uuid,storage_path text,document_name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,r.patient_id,d.storage_path,d.document_name
    from public.bill_charge_requests r
    join public.patient_documents d on d.patient_id=r.patient_id and d.remarks='Clinical charge '||r.id::text
   where r.outside_paid_by is not null and coalesce(r.approval_status,'Pending')<>'Rejected'
     and public.current_user_has_role(array['Admin','Manager','Nurse','Accounts'])
     and not exists(select 1 from public.outside_bill_family_files f where f.request_id=r.id and f.storage_path=d.storage_path and f.expires_at>now()+interval '30 days')
   limit 200
$$;
revoke all on function public.outside_bill_files_needing_links() from public,anon;
grant execute on function public.outside_bill_files_needing_links() to authenticated;

-- 7. Family Portal: the family's own Guest only, verified bills only, no staff names ----------------
create or replace function public.family_portal_outside_bills(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb;
begin
 if coalesce(trim(p_session_token),'')='' then return '[]'::jsonb;end if;
 select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
 if argtype is null then return '[]'::jsonb;end if;
 begin
  execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
 exception when others then return '[]'::jsonb;
 end;
 if d is null or jsonb_typeof(d)<>'object' then return '[]'::jsonb;end if;
 pt:=coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
 select p.id into pid from public.patients p
  where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
 if pid is null then
  select p.id into pid from public.patients p
   where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
 end if;
 if pid is null then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'date',coalesce(r.bill_date,r.charge_date),'item',r.service_name,'provider',r.service_provider,
    'bill_amount',r.outside_bill_amount,'handling_fee',coalesce(r.outside_handling_fee,0),
    'family_paid',r.outside_paid_by='Family paid directly',
    'files',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(f.file_name,'Bill'),'url',f.signed_url) order by f.created_at)
                        from public.outside_bill_family_files f where f.request_id=r.id and f.expires_at>now()),'[]'::jsonb))
    order by coalesce(r.bill_date,r.charge_date) desc,r.created_at desc)
   from public.bill_charge_requests r
  where r.patient_id=pid and r.outside_paid_by is not null and r.approval_status in ('Approved','Partially Approved')),'[]'::jsonb);
end $$;
revoke all on function public.family_portal_outside_bills(text) from public;
grant execute on function public.family_portal_outside_bills(text) to anon, authenticated;

commit;
notify pgrst,'reload schema';

-- Check: all four should be true
select to_regprocedure('public.decide_bill_charge_request_before_outside(uuid,text,numeric,text)') is not null as approval_wrapper_ready,
       to_regprocedure('public.family_portal_outside_bills(text)') is not null as family_bills_ready,
       to_regprocedure('public.outside_bill_settle(uuid,date,text,text)') is not null as payables_ready,
       (select count(*) from public.charge_tariff_master where category='Outside Services' and is_active)>=7 as items_ready;
