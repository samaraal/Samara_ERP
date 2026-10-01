-- ERP 2.15.49. Run after 185. New kitchen cash book; existing stores/Accounts entries are untouched.
-- INR cash only. Funding is a transfer, purchases are expenses. No automatic opening cash credit.
begin;
create table if not exists public.kitchen_wallet(
 id integer primary key check(id=1),primary_staff uuid not null references public.profiles(id),custodian uuid not null references public.profiles(id),
 opening_amount numeric(12,2) not null default 2000,low_limit numeric(12,2) not null default 1000 check(low_limit>=0),
 cover_leave bigint references public.absence_requests(id),cover_started timestamptz,created_at timestamptz not null default now());
create table if not exists public.kitchen_cash_entries(
 id uuid primary key,kind text not null check(kind in ('Cash received','Purchase','Purchase reversal','Cash returned','Adjustment')),
 amount numeric(12,2) not null check(amount<>0),balance_after numeric(12,2) not null check(balance_after>=0),
 reference_id uuid,details text not null,actor uuid not null references public.profiles(id),actor_name text not null,created_at timestamptz not null default now());
create table if not exists public.kitchen_funding(
 id uuid primary key,requested_amount numeric(12,2) not null check(requested_amount>0),amount numeric(12,2),purpose text not null,
 recipient uuid not null references public.profiles(id),status text not null check(status in ('Requested','Approved','Handed over','Received','Declined','Cancelled')),
 requested_by uuid references public.profiles(id),requested_at timestamptz not null default now(),decided_by uuid,decision_note text,handed_by uuid,handed_at timestamptz,received_at timestamptz);
create table if not exists public.kitchen_purchases(
 id uuid primary key,expense_date date not null,vendor text not null,bill_no text,receipt_path text,no_receipt_reason text,
 total numeric(12,2) not null check(total>0),items jsonb not null,status text not null default 'Pending review' check(status in ('Pending review','Reviewed','Query','Reversed')),
 entered_by uuid not null references public.profiles(id),entered_name text not null,created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz,review_note text);
create table if not exists public.kitchen_stock(
 id uuid primary key default gen_random_uuid(),name text not null,unit text not null,quantity numeric(12,3) not null default 0 check(quantity>=0),low_level numeric(12,3) not null default 0 check(low_level>=0),unique(name,unit));
create table if not exists public.kitchen_stock_moves(
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.kitchen_stock(id),quantity numeric(12,3) not null,kind text not null,reference_id uuid,reason text not null,actor uuid not null,created_at timestamptz not null default now());
create table if not exists public.kitchen_handovers(
 id uuid primary key,from_staff uuid not null references public.profiles(id),to_staff uuid not null references public.profiles(id),
 kind text not null check(kind in ('Leave cover','Return','Permanent')),leave_id bigint references public.absence_requests(id),
 status text not null default 'Awaiting outgoing' check(status in ('Awaiting outgoing','Awaiting receipt','Completed','Cancelled')),
 expected_cash numeric(12,2) not null,counted_cash numeric(12,2),stock_snapshot jsonb not null,stock_note text,reason text not null,
 created_by uuid not null,created_at timestamptz not null default now(),outgoing_by uuid,outgoing_at timestamptz,received_at timestamptz);
create unique index if not exists kitchen_one_handover on public.kitchen_handovers((true)) where status in ('Awaiting outgoing','Awaiting receipt');
create table if not exists public.kitchen_reconciliations(id uuid primary key,book_cash numeric(12,2) not null,physical_cash numeric(12,2) not null check(physical_cash>=0),difference numeric(12,2) not null,note text not null,actor uuid not null,created_at timestamptz not null default now());
create table if not exists public.kitchen_audit(id bigint generated always as identity primary key,action text not null,reference_id uuid,actor uuid,actor_name text,details jsonb not null,created_at timestamptz not null default now());
create table if not exists public.kitchen_operations(id uuid primary key,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null);
do $$ declare t text; n integer; who uuid;
begin
 foreach t in array array['kitchen_wallet','kitchen_cash_entries','kitchen_funding','kitchen_purchases','kitchen_stock','kitchen_stock_moves','kitchen_handovers','kitchen_reconciliations','kitchen_audit','kitchen_operations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
 if not exists(select 1 from public.kitchen_wallet) then
  select count(*),(array_agg(id))[1] into n,who from public.profiles where role='STD' and coalesce(active,true) and coalesce(is_active,true) and full_name ~* '\mAkshi\M';
  if n<>1 then raise exception 'Expected exactly one active STD named Akshi; found %',n;end if;
  insert into public.kitchen_wallet(id,primary_staff,custodian) values(1,who,who);
  insert into public.kitchen_funding(id,requested_amount,purpose,recipient,status) values(gen_random_uuid(),2000,'Opening petty cash — Admin must approve and hand over cash; staff must confirm receipt',who,'Requested');
  insert into public.kitchen_audit(action,details) values('Initial configuration',jsonb_build_object('primary_staff',who,'opening_cash_pending',2000,'low_limit',1000));
 end if;
end $$;
create or replace function public.kitchen_actor() returns public.profiles language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles; n integer;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select count(*) into n from public.profiles where id=auth.uid() or auth_user_id=auth.uid();
 if n<>1 then raise exception 'Staff identity is ambiguous';end if;
 select * into p from public.profiles where id=auth.uid() or auth_user_id=auth.uid();
 if not coalesce(p.active,true) or not coalesce(p.is_active,true) then raise exception 'Active staff required';end if;return p;
end $$;
create or replace function public.kitchen_return_ready() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.kitchen_wallet w join public.absence_requests l on l.id=w.cover_leave where l.return_to_duty_date is not null or l.status='cancelled')
$$;
create or replace function public.kitchen_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles:=public.kitchen_actor();w public.kitchen_wallet; pending boolean; back boolean;
begin
 select * into w from public.kitchen_wallet where id=1;
 pending:=exists(select 1 from public.kitchen_handovers where status in ('Awaiting outgoing','Awaiting receipt'));
 back:=public.kitchen_return_ready();
 return jsonb_build_object('read',p.role in ('Admin','Accounts') or p.id in (w.primary_staff,w.custodian) or exists(select 1 from public.kitchen_handovers where to_staff=p.id and status in ('Awaiting outgoing','Awaiting receipt')),
 'admin',p.role='Admin','spend',p.id=w.custodian and not pending and not back,'actor',p.id,'name',p.full_name,'return_ready',back,'frozen',pending);
end $$;
create or replace function public.kitchen_workspace() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.kitchen_access();w public.kitchen_wallet;
begin
 if not (a->>'read')::boolean then raise exception 'Kitchen responsibility or Accounts/Admin access required';end if;
 select * into w from public.kitchen_wallet where id=1;
 return jsonb_build_object('access',a,'wallet',to_jsonb(w),'balance',(select coalesce(sum(amount),0) from public.kitchen_cash_entries),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'role',role) order by full_name) from public.profiles where coalesce(active,true) and coalesce(is_active,true)),'[]'),
 'leaves',coalesce((select jsonb_agg(jsonb_build_object('id',id,'from_date',from_date,'to_date',to_date)) from public.absence_requests where employee_id=w.primary_staff and request_type='Leave' and status='approved' and return_to_duty_date is null),'[]'),
 'cash',coalesce((select jsonb_agg(x order by x.created_at desc) from public.kitchen_cash_entries x),'[]'),
 'funding',coalesce((select jsonb_agg(x order by x.requested_at desc) from public.kitchen_funding x),'[]'),
 'purchases',coalesce((select jsonb_agg(x order by x.created_at desc) from public.kitchen_purchases x),'[]'),
 'stock',coalesce((select jsonb_agg(x order by x.name) from public.kitchen_stock x),'[]'),
 'movements',coalesce((select jsonb_agg(x order by x.created_at desc) from public.kitchen_stock_moves x),'[]'),
 'handovers',coalesce((select jsonb_agg(x order by x.created_at desc) from public.kitchen_handovers x),'[]'),
 'reconciliations',coalesce((select jsonb_agg(x order by x.created_at desc) from public.kitchen_reconciliations x),'[]'),
 'audit',coalesce((select jsonb_agg(x order by x.created_at desc) from public.kitchen_audit x),'[]'));
end $$;
create or replace function public.kitchen_post(p_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles:=public.kitchen_actor();w public.kitchen_wallet;a jsonb;old public.kitchen_operations;f public.kitchen_funding;h public.kitchen_handovers;e public.kitchen_purchases;s public.kitchen_stock;
 target uuid;amt numeric(12,2);bal numeric(12,2);total numeric(12,2):=0;qty numeric(12,3);line jsonb;lines jsonb:='[]';note text:=trim(coalesce(p_data->>'note',''));rid uuid;lk bigint;day date;result jsonb;
begin
 if p_id is null or p_action is null or p_data is null then raise exception 'Operation ID, action and data required';end if;
 -- One lock serializes cash, stock, funding and custody changes, including double clicks/retries.
 select * into w from public.kitchen_wallet where id=1 for update;
 select * into old from public.kitchen_operations where id=p_id;
 if found then
  if old.actor<>p.id or old.action<>p_action or old.payload<>p_data then raise exception 'Operation ID already used';end if;return old.result;
 end if;
 a:=public.kitchen_access();if not (a->>'read')::boolean then raise exception 'Kitchen access required';end if;
 select coalesce(sum(amount),0) into bal from public.kitchen_cash_entries;
 rid:=nullif(p_data->>'id','')::uuid;
 if p_action in ('approve_funding','decline_funding','handover_cash','cancel_funding','review','reverse','adjust','return_cash','settings','handover_create','handover_cancel') and p.role<>'Admin' then raise exception 'Admin required';end if;
 if p_data ? 'amount' and (coalesce((p_data->>'amount')::numeric,0) > 10000000 or coalesce((p_data->>'amount')::numeric,0) < -10000000) then raise exception 'Amount exceeds cash book limit';end if;
 if p_action in ('purchase','request_cash','use_stock','reconcile','return_cash') and not (a->>'spend')::boolean then raise exception 'Current in-charge required; complete any cash handover or Return to Duty handback first';end if;
 if p_action='request_cash' then
  amt:=(p_data->>'amount')::numeric;
  if amt is null or amt<=0 or length(note)<3 then raise exception 'Positive cash amount and purpose required';end if;
  if exists(select 1 from public.kitchen_funding where status in ('Requested','Approved','Handed over')) then raise exception 'A cash request is already open';end if;
  insert into public.kitchen_funding(id,requested_amount,purpose,recipient,status,requested_by) values(p_id,amt,note,w.custodian,'Requested',p.id);
 elsif p_action in ('approve_funding','decline_funding','handover_cash','receive_cash','cancel_funding') then
  select * into f from public.kitchen_funding where id=rid for update;if not found then raise exception 'Cash request not found';end if;
  if p_action='approve_funding' then
   amt:=(p_data->>'amount')::numeric;if f.status<>'Requested' or amt is null or amt<=0 then raise exception 'Pending request and positive amount required';end if;
   update public.kitchen_funding set amount=amt,status='Approved',decided_by=p.id,decision_note=note where id=f.id;
  elsif p_action='decline_funding' then
   if f.status<>'Requested' or length(note)<3 then raise exception 'Pending request and reason required';end if;
   update public.kitchen_funding set status='Declined',decided_by=p.id,decision_note=note where id=f.id;
  elsif p_action='handover_cash' then
   if f.status<>'Approved' or f.recipient<>w.custodian or (a->>'frozen')::boolean or (a->>'return_ready')::boolean then raise exception 'Approved request and settled custody required';end if;
   if length(note)<3 then raise exception 'Record actual cash handover';end if;
   update public.kitchen_funding set status='Handed over',handed_by=p.id,handed_at=now(),decision_note=concat_ws(' · ',decision_note,note) where id=f.id;
  elsif p_action='receive_cash' then
   if f.status<>'Handed over' or f.recipient<>p.id or p.id<>w.custodian or (a->>'frozen')::boolean then raise exception 'Only recipient may confirm cash actually received';end if;
   if (p_data->>'amount')::numeric is distinct from f.amount then raise exception 'Counted cash must match handover amount';end if;
   insert into public.kitchen_cash_entries values(p_id,'Cash received',f.amount,bal+f.amount,f.id,'Cash transfer received: '||f.purpose,p.id,p.full_name,now());
   update public.kitchen_funding set status='Received',received_at=now() where id=f.id;
  else
   if f.status not in ('Requested','Approved') or length(note)<3 then raise exception 'Only unissued funding can be cancelled, with reason';end if;
   update public.kitchen_funding set status='Cancelled',decision_note=note,decided_by=p.id where id=f.id;
  end if;
 elsif p_action='purchase' then
  day:=(p_data->>'date')::date;
  if day is null or day>(now() at time zone 'Asia/Kolkata')::date or day<(w.created_at at time zone 'Asia/Kolkata')::date then raise exception 'Purchase date must fall within this cash book, not in the future';end if;
  if length(trim(coalesce(p_data->>'vendor','')))<2 then raise exception 'Shop/vendor required';end if;
  if nullif(p_data->>'receipt','') is null and length(trim(coalesce(p_data->>'no_receipt','')))<3 then raise exception 'Attach a receipt or record why no receipt is available';end if;
  if nullif(p_data->>'receipt','') is not null and not exists(select 1 from storage.objects where bucket_id='kitchen-receipts' and name=p_data->>'receipt' and split_part(name,'/',1)=p.id::text) then raise exception 'Receipt must be an uploaded kitchen receipt belonging to this staff member';end if;
  if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items') not between 1 and 50 then raise exception 'Enter 1–50 purchase items';end if;
  for line in select * from jsonb_array_elements(p_data->'items') loop
   qty:=(line->>'quantity')::numeric;amt:=round((line->>'price')::numeric,2);
   if qty is null or qty<=0 or amt is null or amt<0 or length(trim(coalesce(line->>'name','')))<2 or length(trim(coalesce(line->>'unit','')))<1 then raise exception 'Each item needs name, unit, positive quantity and nonnegative unit price';end if;
   total:=total+round(qty*amt,2);
   line:=jsonb_build_object('name',trim(line->>'name'),'unit',trim(line->>'unit'),'quantity',qty,'price',amt,'total',round(qty*amt,2),'stock',coalesce((line->>'stock')::boolean,false));
   if (line->>'stock')::boolean then
    insert into public.kitchen_stock(name,unit) values(line->>'name',line->>'unit') on conflict(name,unit) do nothing;
    select * into s from public.kitchen_stock where name=line->>'name' and unit=line->>'unit' for update;
    update public.kitchen_stock set quantity=quantity+qty where id=s.id;
    insert into public.kitchen_stock_moves(item_id,quantity,kind,reference_id,reason,actor) values(s.id,qty,'Purchase',p_id,'Kitchen purchase',p.id);
    line:=line||jsonb_build_object('stock_id',s.id);
   end if;
   lines:=lines||jsonb_build_array(line);
  end loop;
  if total<=0 or total>bal then raise exception 'Purchase must be positive and within available cash (%)',bal;end if;
  insert into public.kitchen_purchases(id,expense_date,vendor,bill_no,receipt_path,no_receipt_reason,total,items,entered_by,entered_name)
  values(p_id,day,trim(p_data->>'vendor'),p_data->>'bill',nullif(p_data->>'receipt',''),p_data->>'no_receipt',total,lines,p.id,p.full_name);
  insert into public.kitchen_cash_entries values(p_id,'Purchase',-total,bal-total,p_id,'Purchase: '||trim(p_data->>'vendor'),p.id,p.full_name,now());
 elsif p_action='review' then
  if p_data->>'status' not in ('Reviewed','Query') or length(note)<3 then raise exception 'Review decision and note required';end if;
  update public.kitchen_purchases set status=p_data->>'status',reviewed_by=p.id,reviewed_at=now(),review_note=note where id=rid and status<>'Reversed';
  if not found then raise exception 'Purchase not found or reversed';end if;
 elsif p_action='reverse' then
  if length(note)<3 or (a->>'frozen')::boolean then raise exception 'Reason required; complete handover first';end if;
  select * into e from public.kitchen_purchases where id=rid for update;if not found or e.status='Reversed' then raise exception 'Purchase missing or already reversed';end if;
  for line in select * from jsonb_array_elements(e.items) loop
   if (line->>'stock')::boolean then
    qty:=(line->>'quantity')::numeric;select * into s from public.kitchen_stock where id=(line->>'stock_id')::uuid for update;
    if s.quantity<qty then raise exception 'Stock already used; resolve the stock discrepancy before reversing';end if;
    update public.kitchen_stock set quantity=quantity-qty where id=s.id;
    insert into public.kitchen_stock_moves(item_id,quantity,kind,reference_id,reason,actor) values(s.id,-qty,'Purchase reversal',p_id,note,p.id);
   end if;
  end loop;
  update public.kitchen_purchases set status='Reversed',review_note=note,reviewed_by=p.id,reviewed_at=now() where id=e.id;
  insert into public.kitchen_cash_entries values(p_id,'Purchase reversal',e.total,bal+e.total,e.id,'Confirmed cash restored / entry correction: '||note,p.id,p.full_name,now());
 elsif p_action='use_stock' then
  qty:=(p_data->>'quantity')::numeric;select * into s from public.kitchen_stock where id=rid for update;
  if not found or qty is null or qty<=0 or qty>s.quantity or p_data->>'kind' not in ('Usage','Wastage') or length(note)<3 then raise exception 'Valid stock, quantity, usage/wastage and reason required';end if;
  update public.kitchen_stock set quantity=quantity-qty where id=s.id;
  insert into public.kitchen_stock_moves(item_id,quantity,kind,reference_id,reason,actor) values(s.id,-qty,p_data->>'kind',p_id,note,p.id);
 elsif p_action in ('adjust','return_cash') then
  amt:=(p_data->>'amount')::numeric;
  if p_action='return_cash' then if amt is null or amt<=0 then raise exception 'Positive cash return required';end if;amt:=-amt;end if;
  if amt is null or amt=0 or bal+amt<0 or length(note)<3 or (a->>'frozen')::boolean then raise exception 'Valid amount, reason and settled custody required';end if;
  insert into public.kitchen_cash_entries values(p_id,case when p_action='adjust' then 'Adjustment' else 'Cash returned' end,amt,bal+amt,null,note,p.id,p.full_name,now());
 elsif p_action='reconcile' then
  amt:=(p_data->>'amount')::numeric;if amt is null or amt<0 or length(note)<3 then raise exception 'Physical cash count and note required';end if;
  insert into public.kitchen_reconciliations values(p_id,bal,amt,amt-bal,note,p.id,now());
 elsif p_action='stock_limit' then
  if p.role<>'Admin' and not (a->>'spend')::boolean then raise exception 'Current in-charge or Admin required';end if;
  amt:=(p_data->>'amount')::numeric;if amt is null or amt<0 or length(note)<3 then raise exception 'Nonnegative stock alert and reason required';end if;
  update public.kitchen_stock set low_level=amt where id=rid;if not found then raise exception 'Stock item not found';end if;
 elsif p_action='settings' then
  amt:=(p_data->>'amount')::numeric;if amt is null or amt<0 or length(note)<3 then raise exception 'Nonnegative alert limit and reason required';end if;
  update public.kitchen_wallet set low_limit=amt where id=1;
 elsif p_action='handover_create' then
  target:=(p_data->>'staff')::uuid;lk:=nullif(p_data->>'leave','')::bigint;
  if target is null or target=w.custodian or not exists(select 1 from public.profiles where id=target and coalesce(active,true) and coalesce(is_active,true)) or length(note)<3 then raise exception 'Different active staff and handover reason required';end if;
  if exists(select 1 from public.kitchen_funding where status in ('Requested','Approved','Handed over')) then raise exception 'Receive or cancel outstanding cash requests before changing custody';end if;
  if p_data->>'kind'='Leave cover' then
   if w.cover_leave is not null or not exists(select 1 from public.absence_requests where id=lk and employee_id=w.primary_staff and request_type='Leave' and status='approved' and return_to_duty_date is null) then raise exception 'Select primary staff approved leave';end if;
  elsif p_data->>'kind'='Return' then
   if not public.kitchen_return_ready() or target<>w.primary_staff then raise exception 'Approved Return to Duty and primary staff recipient required';end if;
  elsif p_data->>'kind'='Permanent' then
   if w.cover_leave is not null then raise exception 'Complete leave handback before changing primary staff';end if;
  else raise exception 'Select leave cover, return or permanent assignment';end if;
  insert into public.kitchen_handovers(id,from_staff,to_staff,kind,leave_id,expected_cash,stock_snapshot,reason,created_by)
  values(p_id,w.custodian,target,p_data->>'kind',lk,bal,coalesce((select jsonb_agg(x) from public.kitchen_stock x),'[]'),note,p.id);
 elsif p_action='handover_out' then
  select * into h from public.kitchen_handovers where id=rid for update;
  if not found or h.status<>'Awaiting outgoing' or (p.id<>h.from_staff and p.role<>'Admin') then raise exception 'Outgoing staff or Admin emergency handover required';end if;
  amt:=(p_data->>'amount')::numeric;
  if amt is distinct from h.expected_cash or length(note)<3 then raise exception 'Cash must match book balance; cancel handover and reconcile any discrepancy first. Stock confirmation and emergency reason (if Admin) required';end if;
  update public.kitchen_handovers set counted_cash=amt,stock_note=note,outgoing_by=p.id,outgoing_at=now(),status='Awaiting receipt' where id=h.id;
 elsif p_action='handover_receive' then
  select * into h from public.kitchen_handovers where id=rid for update;
  if not found or h.status<>'Awaiting receipt' or h.to_staff<>p.id or (p_data->>'amount')::numeric is distinct from h.counted_cash or length(note)<3 then raise exception 'Incoming staff must confirm cash amount and stock received';end if;
  if h.kind='Leave cover' and not exists(select 1 from public.absence_requests where id=h.leave_id and status='approved' and return_to_duty_date is null) then raise exception 'Leave changed; Admin must cancel and review handover';end if;
  update public.kitchen_wallet set custodian=h.to_staff,primary_staff=case when h.kind='Permanent' then h.to_staff else primary_staff end,
   cover_leave=case when h.kind='Leave cover' then h.leave_id else null end,cover_started=case when h.kind='Leave cover' then now() else null end where id=1;
  update public.kitchen_handovers set status='Completed',received_at=now(),stock_note=stock_note||' · Incoming: '||note where id=h.id;
 elsif p_action='handover_cancel' then
  if length(note)<3 then raise exception 'Cancellation reason required';end if;
  update public.kitchen_handovers set status='Cancelled',reason=reason||' · Cancelled: '||note where id=rid and status in ('Awaiting outgoing','Awaiting receipt');
  if not found then raise exception 'No pending handover';end if;
 else raise exception 'Unknown kitchen action';end if;
 result:=jsonb_build_object('success',true,'id',p_id);
 insert into public.kitchen_operations values(p_id,p.id,p_action,p_data,result);
 insert into public.kitchen_audit(action,reference_id,actor,actor_name,details) values(p_action,coalesce(rid,p_id),p.id,p.full_name,p_data);
 return result;
end $$;
revoke all on function public.kitchen_actor(),public.kitchen_return_ready(),public.kitchen_access(),public.kitchen_workspace(),public.kitchen_post(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitchen_access(),public.kitchen_workspace(),public.kitchen_post(uuid,text,jsonb) to authenticated;
-- Private receipt storage; no public URLs and no overwrite/delete of posted evidence.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('kitchen-receipts','kitchen-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists kitchen_receipt_insert on storage.objects;
create policy kitchen_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='kitchen-receipts' and (public.kitchen_access()->>'spend')::boolean and split_part(name,'/',1)=public.kitchen_access()->>'actor');
drop policy if exists kitchen_receipt_read on storage.objects;
create policy kitchen_receipt_read on storage.objects for select to authenticated using(bucket_id='kitchen-receipts' and (public.kitchen_access()->>'read')::boolean);
drop policy if exists kitchen_receipt_read_guard on storage.objects;
create policy kitchen_receipt_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'kitchen-receipts' or (public.kitchen_access()->>'read')::boolean);
drop policy if exists kitchen_receipt_insert_guard on storage.objects;
create policy kitchen_receipt_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'kitchen-receipts' or ((public.kitchen_access()->>'spend')::boolean and split_part(name,'/',1)=public.kitchen_access()->>'actor'));
drop policy if exists kitchen_receipt_update_guard on storage.objects;
create policy kitchen_receipt_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'kitchen-receipts') with check(bucket_id<>'kitchen-receipts');
drop policy if exists kitchen_receipt_delete_guard on storage.objects;
create policy kitchen_receipt_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'kitchen-receipts');
drop policy if exists kitchen_receipt_anon_guard on storage.objects;
create policy kitchen_receipt_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'kitchen-receipts') with check(bucket_id<>'kitchen-receipts');
notify pgrst,'reload schema';
commit;
