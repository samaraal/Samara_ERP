-- Isolated Admin/Director trial. No integration with live financial ledgers.
begin;
create or replace function public.op_trial_access() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p jsonb; director boolean:=false;
begin
 if auth.uid() is null then return null;end if;
 select to_jsonb(x) into p from public.profiles x where x.id=auth.uid();
 if p is null or coalesce(p->>'is_active','true')='false' or coalesce(p->>'active','true')='false' then return null;end if;
 if to_regclass('public.director_office_positions') is not null then
  execute 'select exists(select 1 from public.director_office_positions where position_key=''director'' and assigned_profile_id::text=$1)' into director using p->>'id';
 end if;
 if coalesce(p->>'role','')<>'Admin' and not director then return null;end if;
 return jsonb_build_object('id',p->>'id','name',coalesce(nullif(p->>'full_name',''),'Authorized user'),'role',case when director then 'Director' else 'Admin' end);
end $$;
revoke all on function public.op_trial_access() from public,anon;
grant execute on function public.op_trial_access() to authenticated;
create table if not exists public.op_trial_requests(
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 version integer not null default 1, status text not null default 'Draft' check(status in ('Draft','Pending approval','Returned','Rejected','Approved')),
 payee text not null, purpose text not null, category text not null, amount numeric(14,2) not null check(amount>0),
 due_date date not null, bill_ref text not null default '', documents jsonb not null default '[]',
 created_by uuid not null, created_name text not null, created_at timestamptz not null default now(),
 approved_amount numeric(14,2), approved_by uuid, approved_name text, approved_at timestamptz,
 check(approved_amount is null or (approved_amount>0 and approved_amount<=amount)),check(approved_by is null or approved_by<>created_by));
create unique index if not exists op_trial_duplicate_bill on public.op_trial_requests(lower(trim(payee)),lower(trim(bill_ref))) where trim(bill_ref)<>'' and status<>'Rejected';
create table if not exists public.op_trial_payments(
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 request_id uuid not null references public.op_trial_requests(id), amount numeric(14,2) not null check(amount>0),
 paid_on date not null, method text not null check(method in ('Bank transfer','UPI','Cheque','Cash')),
 account text not null, reference text not null, recipient text not null default '', proof jsonb not null default '[]',
 recorded_by uuid not null, recorded_name text not null, recorded_at timestamptz not null default now(),
 reconciled_by uuid,reconciled_name text,reconciled_at timestamptz,reconciliation_ref text,
 reversed_by uuid,reversed_name text,reversed_at timestamptz,reversal_reason text);
create unique index if not exists op_trial_duplicate_payment on public.op_trial_payments(lower(trim(account)),lower(trim(reference))) where method<>'Cash' and reversed_at is null;
create table if not exists public.op_trial_events(id bigint generated always as identity primary key,request_id uuid not null references public.op_trial_requests(id),action text not null,actor uuid not null,actor_name text not null,at timestamptz not null default now(),details jsonb not null);
create table if not exists public.op_trial_calls(id uuid primary key,actor uuid not null,result jsonb not null);
do $$ declare t text;begin foreach t in array array['op_trial_requests','op_trial_payments','op_trial_events','op_trial_calls'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('outgoing-trial','outgoing-trial',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy op_trial_files_read on storage.objects for select to authenticated using(bucket_id='outgoing-trial' and public.op_trial_access() is not null);
create policy op_trial_files_insert on storage.objects for insert to authenticated with check(bucket_id='outgoing-trial' and public.op_trial_access() is not null);
create policy op_trial_files_guard on storage.objects as restrictive for all to authenticated using(bucket_id<>'outgoing-trial' or public.op_trial_access() is not null) with check(bucket_id<>'outgoing-trial' or public.op_trial_access() is not null);
create policy op_trial_files_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'outgoing-trial') with check(bucket_id<>'outgoing-trial');
create or replace function public.op_trial_rpc(action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.op_trial_access();r public.op_trial_requests;v public.op_trial_payments;
 rid uuid;cid uuid;old_result jsonb;outcome jsonb;val numeric(14,2);paid numeric(14,2);docs jsonb;d jsonb;reason text;
begin
 if a is null then raise exception 'Outgoing Payments trial is restricted to Admin and the assigned Director';end if;
 if action='load' then return jsonb_build_object('authority',a,
  'requests',coalesce((select jsonb_agg(to_jsonb(t) order by number desc) from public.op_trial_requests t),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(t) order by number desc) from public.op_trial_payments t),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.op_trial_events t),'[]'::jsonb));end if;
 cid:=(p->>'call_id')::uuid;if cid is null then raise exception 'Operation ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select result into old_result from public.op_trial_calls where id=cid and actor=(a->>'id')::uuid;
 if found then return old_result;end if;
 reason:=trim(coalesce(p->>'reason',''));
 if action='create' then
  if length(trim(coalesce(p->>'payee','')))<2 or length(trim(coalesce(p->>'purpose','')))<3 or length(trim(coalesce(p->>'category','')))<2 then raise exception 'Payee, purpose and category are required';end if;
  val:=(p->>'amount')::numeric;if val is null or val<=0 then raise exception 'Enter a positive amount';end if;
  insert into public.op_trial_requests(id,payee,purpose,category,amount,due_date,bill_ref,created_by,created_name)
   values(coalesce((p->>'id')::uuid,gen_random_uuid()),trim(p->>'payee'),trim(p->>'purpose'),p->>'category',val,(p->>'due_date')::date,trim(coalesce(p->>'bill_ref','')),(a->>'id')::uuid,a->>'name') returning * into r;
 else
  rid:=(p->>'id')::uuid;select * into r from public.op_trial_requests where id=rid for update;
  if not found then raise exception 'Request not found';end if;
  if r.version<>coalesce((p->>'version')::integer,-1) then raise exception 'This request changed. Refresh and try again';end if;
 end if;
 docs:=coalesce(p->'documents','[]'::jsonb);
 if jsonb_typeof(docs)<>'array' or jsonb_array_length(docs)>10 then raise exception 'Maximum 10 attachments';end if;
 for d in select value from jsonb_array_elements(docs) loop
  if left(coalesce(d->>'path',''),37)<>r.id::text||'/' or not exists(select 1 from storage.objects where bucket_id='outgoing-trial' and name=d->>'path') then raise exception 'Invalid attachment';end if;
 end loop;
 if action in ('create','edit') then
  if r.status not in ('Draft','Returned') or r.created_by<>(a->>'id')::uuid then raise exception 'Only the initiator may edit a draft or returned request';end if;
  if length(trim(coalesce(p->>'payee','')))<2 or length(trim(coalesce(p->>'purpose','')))<3 then raise exception 'Payee and purpose required';end if;
  update public.op_trial_requests set payee=trim(p->>'payee'),purpose=trim(p->>'purpose'),category=p->>'category',amount=(p->>'amount')::numeric,due_date=(p->>'due_date')::date,bill_ref=trim(coalesce(p->>'bill_ref','')),documents=docs where id=r.id;
 elsif action='submit' then
  if r.status not in ('Draft','Returned') or r.created_by<>(a->>'id')::uuid then raise exception 'Only the initiator can submit this request';end if;
  if jsonb_array_length(r.documents)=0 and reason='' then raise exception 'Attach a bill or explain why supporting documents are unavailable';end if;
  update public.op_trial_requests set status='Pending approval' where id=r.id;
 elsif action in ('approve','return','reject') then
  if r.status<>'Pending approval' then raise exception 'Request must await approval';end if;
  if r.created_by=(a->>'id')::uuid then raise exception 'Another Admin or Director must review this request; self-approval is not permitted';end if;
  if action='approve' then
   val:=(p->>'amount')::numeric;if val is null or val<=0 or val>r.amount then raise exception 'Approval must be positive and no greater than requested';end if;
   update public.op_trial_requests set status='Approved',approved_amount=val,approved_by=(a->>'id')::uuid,approved_name=a->>'name',approved_at=now() where id=r.id;
  else
   if reason='' then raise exception 'Review reason required';end if;
   update public.op_trial_requests set status=case when action='return' then 'Returned' else 'Rejected' end where id=r.id;
  end if;
 elsif action='pay' then
  if r.status<>'Approved' then raise exception 'Approval required before recording payment';end if;
  select coalesce(sum(amount),0) into paid from public.op_trial_payments where request_id=r.id and reversed_at is null;
  val:=(p->>'amount')::numeric;if val is null or val<=0 or paid+val>r.approved_amount then raise exception 'Payment exceeds the approved unpaid balance';end if;
  if (p->>'paid_on')::date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Payment date cannot be in the future';end if;
  if trim(coalesce(p->>'account',''))='' or trim(coalesce(p->>'reference',''))='' then raise exception 'Account and transaction reference / cash acknowledgment required';end if;
  if p->>'method'='Cash' and trim(coalesce(p->>'recipient',''))='' then raise exception 'Cash recipient name required';end if;
  if jsonb_array_length(docs)=0 and reason='' then raise exception 'Attach payment proof or record why it is pending';end if;
  insert into public.op_trial_payments(request_id,amount,paid_on,method,account,reference,recipient,proof,recorded_by,recorded_name)
  values(r.id,val,(p->>'paid_on')::date,p->>'method',trim(p->>'account'),trim(p->>'reference'),trim(coalesce(p->>'recipient','')),docs,(a->>'id')::uuid,a->>'name') returning * into v;
 elsif action in ('reconcile','reverse','proof') then
  select * into v from public.op_trial_payments where id=(p->>'payment_id')::uuid and request_id=r.id for update;
  if not found or v.reversed_at is not null then raise exception 'Active voucher not found';end if;
  if action='reconcile' then
   if v.reconciled_at is not null then raise exception 'Voucher already reconciled';end if;
   if reason='' then raise exception 'Bank statement / cashbook reference required';end if;
   if jsonb_array_length(v.proof)=0 then raise exception 'Attach payment proof before reconciliation';end if;
   update public.op_trial_payments set reconciled_by=(a->>'id')::uuid,reconciled_name=a->>'name',reconciled_at=now(),reconciliation_ref=reason where id=v.id;
  elsif action='proof' then
   if v.reconciled_at is not null or jsonb_array_length(docs)=0 then raise exception 'Attach proof to an unreconciled voucher';end if;
   update public.op_trial_payments set proof=proof||docs where id=v.id;
  else
   if reason='' then raise exception 'Reversal reason required';end if;
   if v.recorded_by=(a->>'id')::uuid then raise exception 'Another Admin or Director must reverse this voucher';end if;
   update public.op_trial_payments set reversed_by=(a->>'id')::uuid,reversed_name=a->>'name',reversed_at=now(),reversal_reason=reason where id=v.id;
  end if;
 else raise exception 'Unknown action';end if;
 update public.op_trial_requests set version=version+1 where id=r.id returning * into r;
 insert into public.op_trial_events(request_id,action,actor,actor_name,details) values(r.id,action,(a->>'id')::uuid,a->>'name',jsonb_build_object('reason',reason,'amount',val,'payment_id',v.id,'request',to_jsonb(r)));
 outcome:=jsonb_build_object('id',r.id,'version',r.version,'payment_id',v.id);
 insert into public.op_trial_calls values(cid,(a->>'id')::uuid,outcome);return outcome;
end $$;
revoke all on function public.op_trial_rpc(text,jsonb) from public,anon;
grant execute on function public.op_trial_rpc(text,jsonb) to authenticated;
commit;
