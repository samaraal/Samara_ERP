-- Payments & Vouchers trial: Accountant -> verification -> Admin/Director approval -> Accountant payment -> reconciliation.
begin;
alter table public.op_trial_requests add column if not exists verified_by uuid;
alter table public.op_trial_requests add column if not exists verified_name text;
alter table public.op_trial_requests add column if not exists verified_at timestamptz;
alter table public.op_trial_requests drop constraint if exists op_trial_requests_status_check;
alter table public.op_trial_requests add constraint op_trial_requests_status_check check(status in ('Draft','Pending verification','Pending approval','Returned','Rejected','Approved'));
-- Pending requests from the old trial must be verified before approval.
update public.op_trial_requests set status='Pending verification',version=version+1 where status='Pending approval' and verified_by is null;
create or replace function public.op_trial_access() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p jsonb; director boolean:=false; full_access boolean; manager boolean; accountant boolean; has_manager boolean; des text;dept text;
begin
 if auth.uid() is null then return null;end if;
 select to_jsonb(x) into p from public.profiles x where x.id=auth.uid();
 if p is null or coalesce(p->>'is_active','true')='false' or coalesce(p->>'active','true')='false' then return null;end if;
 if to_regclass('public.director_office_positions') is not null then
 execute 'select exists(select 1 from public.director_office_positions where position_key=''director'' and assigned_profile_id::text=$1)' into director using p->>'id';end if;
 full_access:=coalesce(p->>'role','')='Admin' or director;
 des:=lower(trim(coalesce(p->>'designation','')));dept:=lower(trim(coalesce(p->>'department','')));
 manager:=coalesce(p->>'role','') in ('Manager','Accounts') and (des in ('accounts manager','accounting manager','finance manager') or (p->>'role'='Manager' and dept in ('accounts','finance','accounts & finance','accounts and finance')));
 accountant:=coalesce(p->>'role','')='Accounts' and not manager and not full_access;
 if not full_access and not manager and not accountant then return null;end if;
 select exists(select 1 from public.profiles x where coalesce(to_jsonb(x)->>'is_active','true')<>'false' and coalesce(to_jsonb(x)->>'active','true')<>'false' and x.role in ('Manager','Accounts') and (lower(trim(coalesce(to_jsonb(x)->>'designation',''))) in ('accounts manager','accounting manager','finance manager') or (x.role='Manager' and lower(trim(coalesce(to_jsonb(x)->>'department',''))) in ('accounts','finance','accounts & finance','accounts and finance')))) into has_manager;
 return jsonb_build_object('id',p->>'id','name',coalesce(nullif(p->>'full_name',''),'Authorized user'),'role',case when director then 'Director' when full_access then 'Admin' when manager then 'Accounts Manager' else 'Accountant' end,'full',full_access,'prepare',accountant or full_access,'pay',accountant,'verify',manager or (full_access and not has_manager),'reconcile',manager or (full_access and not has_manager),'fallback',not has_manager);
end $$;
create or replace function public.op_trial_can_read(rid uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.op_trial_access();r public.op_trial_requests;
begin
 if a is null then return false;end if;
 select * into r from public.op_trial_requests where id=rid;
 if not found then return false;end if;
 return coalesce((a->>'full')::boolean,false) or r.created_by=(a->>'id')::uuid or (a->>'role'='Accountant' and r.status='Approved') or (a->>'role'='Accounts Manager' and r.status<>'Draft');
end $$;
revoke all on function public.op_trial_can_read(uuid) from public,anon;grant execute on function public.op_trial_can_read(uuid) to authenticated;
create or replace function public.op_trial_file_allowed(path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.op_trial_access();rid uuid;begin
 if a is null then return false;end if;
 begin rid:=split_part(path,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 if writing then return ((a->>'prepare')::boolean or (a->>'pay')::boolean) and (public.op_trial_can_read(rid) or not exists(select 1 from public.op_trial_requests where id=rid));end if;
 return public.op_trial_can_read(rid);
end $$;
revoke all on function public.op_trial_file_allowed(text,boolean) from public,anon;grant execute on function public.op_trial_file_allowed(text,boolean) to authenticated;
alter policy op_trial_files_read on storage.objects using(bucket_id='outgoing-trial' and public.op_trial_file_allowed(name,false));
alter policy op_trial_files_insert on storage.objects with check(bucket_id='outgoing-trial' and public.op_trial_file_allowed(name,true));
alter policy op_trial_files_guard on storage.objects using(bucket_id<>'outgoing-trial' or public.op_trial_file_allowed(name,false)) with check(bucket_id<>'outgoing-trial' or public.op_trial_file_allowed(name,true));
create or replace function public.op_trial_rpc(action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.op_trial_access();r public.op_trial_requests;v public.op_trial_payments;
 rid uuid;cid uuid;old_result jsonb;outcome jsonb;val numeric(14,2);paid numeric(14,2);docs jsonb;d jsonb;reason text;
begin
 if a is null then raise exception 'Payments & Vouchers is restricted to authorized finance staff and Admin/Director';end if;
 if action='load' then return jsonb_build_object('authority',a,
  'requests',coalesce((select jsonb_agg(to_jsonb(t) order by number desc) from public.op_trial_requests t where public.op_trial_can_read(t.id)),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(t) order by number desc) from public.op_trial_payments t where public.op_trial_can_read(t.request_id)),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.op_trial_events t where public.op_trial_can_read(t.request_id)),'[]'::jsonb));end if;
 cid:=(p->>'call_id')::uuid;if cid is null then raise exception 'Operation ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select result into old_result from public.op_trial_calls where id=cid and actor=(a->>'id')::uuid;
 if found then return old_result;end if;
 reason:=trim(coalesce(p->>'reason',''));
 if action='create' then
  if not (a->>'prepare')::boolean then raise exception 'Only Accountant or Admin/Director may prepare requests';end if;
  if length(trim(coalesce(p->>'payee','')))<2 or length(trim(coalesce(p->>'purpose','')))<3 or length(trim(coalesce(p->>'category','')))<2 then raise exception 'Payee, purpose and category are required';end if;
  val:=(p->>'amount')::numeric;if val is null or val<=0 then raise exception 'Enter a positive amount';end if;
  insert into public.op_trial_requests(id,payee,purpose,category,amount,due_date,bill_ref,created_by,created_name)
   values(coalesce((p->>'id')::uuid,gen_random_uuid()),trim(p->>'payee'),trim(p->>'purpose'),p->>'category',val,(p->>'due_date')::date,trim(coalesce(p->>'bill_ref','')),(a->>'id')::uuid,a->>'name') returning * into r;
 else
  rid:=(p->>'id')::uuid;select * into r from public.op_trial_requests where id=rid for update;
  if not found or not public.op_trial_can_read(rid) then raise exception 'Request not available to your role';end if;
  if r.version<>coalesce((p->>'version')::integer,-1) then raise exception 'This request changed. Refresh and try again';end if;
 end if;
 docs:=coalesce(p->'documents','[]'::jsonb);
 if jsonb_typeof(docs)<>'array' or jsonb_array_length(docs)>10 then raise exception 'Maximum 10 attachments';end if;
 for d in select value from jsonb_array_elements(docs) loop
  if left(coalesce(d->>'path',''),37)<>r.id::text||'/' or not exists(select 1 from storage.objects where bucket_id='outgoing-trial' and name=d->>'path') then raise exception 'Invalid attachment';end if;
 end loop;
 select coalesce(jsonb_agg(coalesce((select x from jsonb_array_elements(r.documents) x where x->>'path'=j->>'path' limit 1),jsonb_build_object('path',j->>'path','name',left(j->>'name',200),'uploaded_by',a->>'id','uploaded_name',a->>'name','uploaded_at',now()))),'[]'::jsonb) into docs from jsonb_array_elements(docs) j;
 if action in ('create','edit') then
  if not (a->>'prepare')::boolean then raise exception 'Preparation permission required';end if;
  if r.status not in ('Draft','Returned') or r.created_by<>(a->>'id')::uuid then raise exception 'Only the initiator may edit a draft or returned request';end if;
  if length(trim(coalesce(p->>'payee','')))<2 or length(trim(coalesce(p->>'purpose','')))<3 then raise exception 'Payee and purpose required';end if;
  update public.op_trial_requests set payee=trim(p->>'payee'),purpose=trim(p->>'purpose'),category=p->>'category',amount=(p->>'amount')::numeric,due_date=(p->>'due_date')::date,bill_ref=trim(coalesce(p->>'bill_ref','')),documents=docs where id=r.id;
 elsif action='submit' then
  if not (a->>'prepare')::boolean or r.status not in ('Draft','Returned') or r.created_by<>(a->>'id')::uuid then raise exception 'Only the initiator can submit this request';end if;
  if jsonb_array_length(r.documents)=0 and reason='' then raise exception 'Attach a bill or explain why supporting documents are unavailable';end if;
  update public.op_trial_requests set status='Pending verification',verified_by=null,verified_name=null,verified_at=null,approved_by=null,approved_name=null,approved_at=null,approved_amount=null where id=r.id;
 elsif action='verify' then
  if not (a->>'verify')::boolean or not (r.status='Pending verification' or (r.status='Approved' and r.verified_by is null)) then raise exception 'Verification requires Accounts Manager or the temporary Admin/Director verifier';end if;
  if r.created_by=(a->>'id')::uuid then raise exception 'The preparer cannot verify their own request';end if;
  update public.op_trial_requests set status='Pending approval',verified_by=(a->>'id')::uuid,verified_name=a->>'name',verified_at=now() where id=r.id;
 elsif action='approve' then
  if not (a->>'full')::boolean or r.status<>'Pending approval' or r.verified_by is null then raise exception 'Admin/Director approval requires completed verification';end if;
  if r.created_by=(a->>'id')::uuid or r.verified_by=(a->>'id')::uuid then raise exception 'The approver must differ from both preparer and verifier';end if;
  val:=(p->>'amount')::numeric;if val is null or val<=0 or val>r.amount then raise exception 'Approval must be positive and no greater than requested';end if;
  if val<(select coalesce(sum(amount),0) from public.op_trial_payments where request_id=r.id and reversed_at is null) then raise exception 'Approval cannot be below payments already recorded';end if;
  update public.op_trial_requests set status='Approved',approved_amount=val,approved_by=(a->>'id')::uuid,approved_name=a->>'name',approved_at=now() where id=r.id;
 elsif action in ('return','reject') then
  if r.created_by=(a->>'id')::uuid then raise exception 'Another reviewer must return or reject the request';end if;
  if not ((r.status='Pending verification' and (a->>'verify')::boolean and action='return') or (r.status='Pending approval' and (a->>'full')::boolean and r.verified_by<>(a->>'id')::uuid)) then raise exception 'This review action is not available to your role';end if;
  if reason='' then raise exception 'Review reason required';end if;
  update public.op_trial_requests set status=case when action='return' then 'Returned' else 'Rejected' end,verified_by=null,verified_name=null,verified_at=null where id=r.id;
 elsif action='attach' then
  if not ((a->>'full')::boolean or (a->>'pay')::boolean) or jsonb_array_length(docs)=0 then raise exception 'Supporting documents required and finance upload permission needed';end if;
  update public.op_trial_requests set documents=documents||docs where id=r.id;
 elsif action='pay' then
  if not (a->>'pay')::boolean then raise exception 'Only the Accountant may release and record payments';end if;
  if r.status<>'Approved' then raise exception 'Approval required before recording payment';end if;
  if r.verified_by is null then raise exception 'Legacy trial request needs verification before another payment';end if;
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
   if not (a->>'reconcile')::boolean or v.recorded_by=(a->>'id')::uuid then raise exception 'Independent Accounts Manager or temporary Admin/Director reconciliation required';end if;
   if v.reconciled_at is not null then raise exception 'Voucher already reconciled';end if;
   if reason='' then raise exception 'Bank statement / cashbook reference required';end if;
   if jsonb_array_length(v.proof)=0 then raise exception 'Attach payment proof before reconciliation';end if;
   update public.op_trial_payments set reconciled_by=(a->>'id')::uuid,reconciled_name=a->>'name',reconciled_at=now(),reconciliation_ref=reason where id=v.id;
  elsif action='proof' then
   if not ((a->>'pay')::boolean or (a->>'full')::boolean) then raise exception 'Only finance preparation staff may add payment proof';end if;
   if v.reconciled_at is not null or jsonb_array_length(docs)=0 then raise exception 'Attach proof to an unreconciled voucher';end if;
   update public.op_trial_payments set proof=proof||docs where id=v.id;
  else
   if reason='' then raise exception 'Reversal reason required';end if;
   if not (a->>'full')::boolean or v.recorded_by=(a->>'id')::uuid then raise exception 'Independent Admin/Director must authorize the reversal';end if;
   update public.op_trial_payments set reversed_by=(a->>'id')::uuid,reversed_name=a->>'name',reversed_at=now(),reversal_reason=reason where id=v.id;
  end if;
 else raise exception 'Unknown action';end if;
 update public.op_trial_requests set version=version+1 where id=r.id returning * into r;
 insert into public.op_trial_events(request_id,action,actor,actor_name,details) values(r.id,action,(a->>'id')::uuid,a->>'name',jsonb_build_object('reason',reason,'amount',val,'payment_id',v.id,'request',to_jsonb(r),'documents',docs));
 outcome:=jsonb_build_object('id',r.id,'version',r.version,'payment_id',v.id);
 insert into public.op_trial_calls values(cid,(a->>'id')::uuid,outcome);return outcome;
end $$;
revoke all on function public.op_trial_rpc(text,jsonb) from public,anon;
grant execute on function public.op_trial_rpc(text,jsonb) to authenticated;
commit;
