-- ERP 2.16.19 — Nursing Manager Petty Cash book (run after 214).
-- Flow: Nursing Manager requests → Admin / Director approves and hands over → Nursing Manager confirms cash received.
-- She records her expenses (purpose, optional bill photo / PDF); Admin reviews or reverses them.
-- Kitchen cash she hands over to STD (Kitchen / Food Stores) is deducted from this book automatically.
-- The balance may go below zero (shown in red). Safe to run more than once.
begin;

create table if not exists public.nm_petty_cash_requests(
 id uuid primary key,requested_amount numeric(12,2) not null check(requested_amount>0),amount numeric(12,2),purpose text not null,
 status text not null check(status in ('Requested','Approved','Handed over','Received','Declined','Cancelled')),
 requested_by uuid not null references public.profiles(id),requested_by_name text,requested_at timestamptz not null default now(),
 decided_by uuid,decided_by_name text,decided_at timestamptz,decision_note text,
 handed_by uuid,handed_by_name text,handed_at timestamptz,handover_note text,
 received_at timestamptz,receipt_note text);
create table if not exists public.nm_petty_cash_entries(
 id uuid primary key,kind text not null check(kind in ('Cash received','Expense','Kitchen cash to STD','Expense reversal')),
 amount numeric(12,2) not null check(amount<>0),entry_date date not null default (now() at time zone 'Asia/Kolkata')::date,
 details text not null,paid_to text,bill_no text,receipt_path text,reference_id uuid,
 actor uuid not null references public.profiles(id),actor_name text not null,created_at timestamptz not null default now(),
 review_status text check(review_status in ('Pending review','Reviewed','Query','Reversed')),
 reviewed_by uuid,reviewed_by_name text,reviewed_at timestamptz,review_note text);
create index if not exists nm_petty_cash_entries_created on public.nm_petty_cash_entries(created_at desc);
create table if not exists public.nm_petty_cash_operations(id uuid primary key,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
do $$ declare t text; begin
 foreach t in array array['nm_petty_cash_requests','nm_petty_cash_entries','nm_petty_cash_operations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- Who may see / act. Nursing Manager = designation Nursing / Nurse Manager (same check as indents, SQL 205).
create or replace function public.nm_petty_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles:=public.kitchen_actor();nm boolean:=public.indent_is_nursing_manager(p.id);
begin
 return jsonb_build_object('read',p.role in ('Admin','Accounts') or nm,'admin',p.role='Admin','nm',nm,'actor',p.id,'name',p.full_name);
end $$;

create or replace function public.nm_petty_workspace() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.nm_petty_access();
begin
 if not (a->>'read')::boolean then raise exception 'Nursing Manager or Admin / Accounts access required';end if;
 return jsonb_build_object('access',a,
  'balance',(select coalesce(sum(amount),0) from public.nm_petty_cash_entries),
  'requests',coalesce((select jsonb_agg(x order by x.requested_at desc) from public.nm_petty_cash_requests x),'[]'),
  'entries',coalesce((select jsonb_agg(x order by x.created_at desc) from (select * from public.nm_petty_cash_entries order by created_at desc limit 3000) x),'[]'));
end $$;

create or replace function public.nm_petty_post(p_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles:=public.kitchen_actor();a jsonb;old public.nm_petty_cash_operations;r public.nm_petty_cash_requests;e public.nm_petty_cash_entries;
 amt numeric(12,2);note text:=trim(coalesce(p_data->>'note',''));rid uuid;day date;result jsonb;
begin
 if p_id is null or p_action is null or p_data is null then raise exception 'Operation ID, action and data required';end if;
 perform pg_advisory_xact_lock(hashtext('samara_nm_petty_cash'));
 select * into old from public.nm_petty_cash_operations where id=p_id;
 if found then if old.actor<>p.id or old.action<>p_action or old.payload<>p_data then raise exception 'Operation ID already used';end if;return old.result;end if;
 a:=public.nm_petty_access();rid:=nullif(p_data->>'id','')::uuid;
 if p_action in ('request','receive','expense') and not (a->>'nm')::boolean then raise exception 'Only the Nursing Manager maintains this petty cash';end if;
 if p_action in ('approve','decline','handover','approve_handover','review','reverse') and not (a->>'admin')::boolean then raise exception 'Admin / Director required';end if;
 if p_data ? 'amount' and abs(coalesce((p_data->>'amount')::numeric,0))>10000000 then raise exception 'Amount too large';end if;
 if p_action='request' then
  amt:=(p_data->>'amount')::numeric;
  if amt is null or amt<=0 or length(note)<3 then raise exception 'Enter a positive amount and the purpose';end if;
  if exists(select 1 from public.nm_petty_cash_requests where status in ('Requested','Approved','Handed over')) then raise exception 'A petty cash request is already open';end if;
  insert into public.nm_petty_cash_requests(id,requested_amount,purpose,status,requested_by,requested_by_name) values(p_id,amt,note,'Requested',p.id,p.full_name);
 elsif p_action in ('approve','decline','handover','approve_handover','receive','cancel') then
  select * into r from public.nm_petty_cash_requests where id=rid for update;if not found then raise exception 'Request not found';end if;
  if p_action in ('approve','approve_handover') then
   amt:=(p_data->>'amount')::numeric;
   if r.status<>'Requested' or amt is null or amt<=0 then raise exception 'Pending request and positive amount required';end if;
   update public.nm_petty_cash_requests set amount=amt,status='Approved',decided_by=p.id,decided_by_name=p.full_name,decided_at=now(),decision_note=nullif(note,'') where id=r.id;
   if p_action='approve_handover' then
    update public.nm_petty_cash_requests set status='Handed over',handed_by=p.id,handed_by_name=p.full_name,handed_at=now(),handover_note=nullif(note,'') where id=r.id;
   end if;
  elsif p_action='decline' then
   if r.status<>'Requested' or length(note)<3 then raise exception 'Pending request and reason required';end if;
   update public.nm_petty_cash_requests set status='Declined',decided_by=p.id,decided_by_name=p.full_name,decided_at=now(),decision_note=note where id=r.id;
  elsif p_action='handover' then
   if r.status<>'Approved' then raise exception 'Only an approved request can be handed over';end if;
   update public.nm_petty_cash_requests set status='Handed over',handed_by=p.id,handed_by_name=p.full_name,handed_at=now(),handover_note=nullif(note,'') where id=r.id;
  elsif p_action='receive' then
   if r.status<>'Handed over' then raise exception 'Cash has not been handed over yet';end if;
   if (p_data->>'amount')::numeric is distinct from r.amount then raise exception 'Counted cash must match the handed-over amount (₹%)',r.amount;end if;
   insert into public.nm_petty_cash_entries(id,kind,amount,details,reference_id,actor,actor_name) values(p_id,'Cash received',r.amount,'Petty cash received from '||coalesce(r.handed_by_name,'Admin')||' — '||r.purpose,r.id,p.id,p.full_name);
   update public.nm_petty_cash_requests set status='Received',received_at=now(),receipt_note=nullif(note,'') where id=r.id;
  else -- cancel
   if r.status not in ('Requested','Approved') or length(note)<3 then raise exception 'Only a request not yet handed over can be cancelled, with reason';end if;
   if not (a->>'admin')::boolean and not (r.requested_by=p.id and r.status='Requested') then raise exception 'Admin, or the requester before approval, can cancel';end if;
   update public.nm_petty_cash_requests set status='Cancelled',decision_note=note,decided_by=p.id,decided_by_name=p.full_name,decided_at=now() where id=r.id;
  end if;
 elsif p_action='expense' then
  amt:=(p_data->>'amount')::numeric;day:=(p_data->>'date')::date;
  if amt is null or amt<=0 then raise exception 'Enter the amount paid';end if;
  if day is null or day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Expense date cannot be in the future';end if;
  if length(note)<3 then raise exception 'Enter what the money was spent on';end if;
  if nullif(p_data->>'receipt','') is not null and not exists(select 1 from storage.objects where bucket_id='nm-petty-receipts' and name=p_data->>'receipt' and split_part(name,'/',1)=p.id::text) then raise exception 'Bill must be uploaded by you';end if;
  insert into public.nm_petty_cash_entries(id,kind,amount,entry_date,details,paid_to,bill_no,receipt_path,actor,actor_name,review_status)
  values(p_id,'Expense',-amt,day,note,nullif(trim(coalesce(p_data->>'paid_to','')),''),nullif(trim(coalesce(p_data->>'bill','')),''),nullif(p_data->>'receipt',''),p.id,p.full_name,'Pending review');
 elsif p_action='review' then
  if p_data->>'status' not in ('Reviewed','Query') or length(note)<3 then raise exception 'Review decision and note required';end if;
  update public.nm_petty_cash_entries set review_status=p_data->>'status',reviewed_by=p.id,reviewed_by_name=p.full_name,reviewed_at=now(),review_note=note where id=rid and kind='Expense' and review_status<>'Reversed';
  if not found then raise exception 'Expense not found or reversed';end if;
 elsif p_action='reverse' then
  if length(note)<3 then raise exception 'Reason required';end if;
  select * into e from public.nm_petty_cash_entries where id=rid for update;
  if not found or e.kind<>'Expense' or e.review_status='Reversed' then raise exception 'Expense missing or already reversed';end if;
  update public.nm_petty_cash_entries set review_status='Reversed',reviewed_by=p.id,reviewed_by_name=p.full_name,reviewed_at=now(),review_note=note where id=e.id;
  insert into public.nm_petty_cash_entries(id,kind,amount,details,reference_id,actor,actor_name) values(p_id,'Expense reversal',-e.amount,'Reversal of expense "'||e.details||'": '||note,e.id,p.id,p.full_name);
 else raise exception 'Unknown petty cash action';end if;
 result:=jsonb_build_object('success',true,'id',p_id);
 insert into public.nm_petty_cash_operations(id,actor,action,payload,result) values(p_id,p.id,p_action,p_data,result);
 return result;
end $$;

-- ERP pop-up alerts: Requested / Approved → Admin · Handed over, Query on an expense → Nursing Manager.
create or replace function public.nm_petty_alerts() returns table(ref_id uuid,stage text,amount numeric,details text,person text,stage_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid;r text;nm boolean;
begin
 if auth.uid() is null then return;end if;
 select id,role into me,r from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(active,true) and coalesce(is_active,true) limit 1;
 if me is null then return;end if;
 nm:=public.indent_is_nursing_manager(me);
 return query
 select x.id,x.status,coalesce(x.amount,x.requested_amount),x.purpose,x.requested_by_name,case x.status when 'Requested' then x.requested_at when 'Approved' then x.decided_at else x.handed_at end
 from public.nm_petty_cash_requests x
 where (x.status in ('Requested','Approved') and r='Admin') or (x.status='Handed over' and nm)
 union all
 select e.id,'Query',-e.amount,e.details,e.reviewed_by_name,e.reviewed_at from public.nm_petty_cash_entries e where e.review_status='Query' and nm
 order by 6 desc limit 20;
end $$;

-- Kitchen cash handover (from SQL 214) + automatic deduction from the Nursing Manager's petty cash.
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
 a:=public.kitchen_access();
 -- 2.16.17: the Nursing Manager may open only the cash-handover step (she has no other kitchen access).
 if not ((a->>'read')::boolean or (p_action='handover_cash' and (a->>'nm')::boolean)) then raise exception 'Kitchen access required';end if;
 select coalesce(sum(amount),0) into bal from public.kitchen_cash_entries;
 rid:=nullif(p_data->>'id','')::uuid;
 if p_action in ('approve_funding','decline_funding','cancel_funding','review','reverse','adjust','return_cash','settings','handover_create','handover_cancel') and p.role<>'Admin' then raise exception 'Admin required';end if;
 -- 2.16.17: STD requests → Admin / Director approves → Nursing Manager hands over cash → STD confirms receipt.
 -- Admin can still record the handover only as a backup (e.g. Nursing Manager on leave).
 if p_action='handover_cash' and p.role<>'Admin' and not (a->>'nm')::boolean then raise exception 'Nursing Manager hands over kitchen cash';end if;
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
   -- 2.16.19: cash handed over by the Nursing Manager is taken out of her Petty Cash book automatically
   -- (balance may go below zero — shown in red until she is topped up). Admin's backup handover is not.
   if coalesce((a->>'nm')::boolean,false) and p.role<>'Admin' then
    insert into public.nm_petty_cash_entries(id,kind,amount,details,reference_id,actor,actor_name)
    values(p_id,'Kitchen cash to STD',-f.amount,'Kitchen petty cash handed to '||coalesce((select full_name from public.profiles where id=f.recipient),'STD')||' — '||f.purpose,f.id,p.id,p.full_name);
   end if;
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

revoke all on function public.nm_petty_access(),public.nm_petty_workspace(),public.nm_petty_post(uuid,text,jsonb),public.nm_petty_alerts(),public.kitchen_post(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nm_petty_access(),public.nm_petty_workspace(),public.nm_petty_post(uuid,text,jsonb),public.nm_petty_alerts(),public.kitchen_post(uuid,text,jsonb) to authenticated;

-- Private bill photos / PDFs (same rules as kitchen receipts): only the Nursing Manager uploads into her own folder; no overwrite / delete.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nm-petty-receipts','nm-petty-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists nm_petty_receipt_insert on storage.objects;
create policy nm_petty_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='nm-petty-receipts' and (public.nm_petty_access()->>'nm')::boolean and split_part(name,'/',1)=public.nm_petty_access()->>'actor');
drop policy if exists nm_petty_receipt_read on storage.objects;
create policy nm_petty_receipt_read on storage.objects for select to authenticated using(bucket_id='nm-petty-receipts' and (public.nm_petty_access()->>'read')::boolean);
drop policy if exists nm_petty_receipt_read_guard on storage.objects;
create policy nm_petty_receipt_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'nm-petty-receipts' or (public.nm_petty_access()->>'read')::boolean);
drop policy if exists nm_petty_receipt_insert_guard on storage.objects;
create policy nm_petty_receipt_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'nm-petty-receipts' or ((public.nm_petty_access()->>'nm')::boolean and split_part(name,'/',1)=public.nm_petty_access()->>'actor'));
drop policy if exists nm_petty_receipt_update_guard on storage.objects;
create policy nm_petty_receipt_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'nm-petty-receipts') with check(bucket_id<>'nm-petty-receipts');
drop policy if exists nm_petty_receipt_delete_guard on storage.objects;
create policy nm_petty_receipt_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'nm-petty-receipts');
drop policy if exists nm_petty_receipt_anon_guard on storage.objects;
create policy nm_petty_receipt_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'nm-petty-receipts') with check(bucket_id<>'nm-petty-receipts');
notify pgrst,'reload schema';
commit;
