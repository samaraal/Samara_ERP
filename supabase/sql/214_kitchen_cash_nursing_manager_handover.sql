-- ERP 2.16.17 — Kitchen petty cash: STD requests → Admin / Director approves → Nursing Manager hands over → STD receives.
-- Run after 213 (needs 186 kitchen petty cash and 205 indent_is_nursing_manager, both already installed).
-- Changes only who records the cash handover and adds an alert list. Cash book, purchases, stock and custody rules are unchanged.
-- Safe to run more than once.
begin;

-- 1. Access: new flag 'nm' (Nursing Manager). 'read' (full cash book, receipts) is unchanged — the Nursing Manager does NOT get it.
create or replace function public.kitchen_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles:=public.kitchen_actor();w public.kitchen_wallet; pending boolean; back boolean;
begin
 select * into w from public.kitchen_wallet where id=1;
 pending:=exists(select 1 from public.kitchen_handovers where status in ('Awaiting outgoing','Awaiting receipt'));
 back:=public.kitchen_return_ready();
 return jsonb_build_object('read',p.role in ('Admin','Accounts') or p.id in (w.primary_staff,w.custodian) or exists(select 1 from public.kitchen_handovers where to_staff=p.id and status in ('Awaiting outgoing','Awaiting receipt')),
 'admin',p.role='Admin','spend',p.id=w.custodian and not pending and not back,'actor',p.id,'name',p.full_name,'return_ready',back,'frozen',pending,
 'nm',public.indent_is_nursing_manager(p.id));
end $$;

-- 2. Workspace: full data as before; a Nursing Manager without other kitchen access gets only the cash requests.
create or replace function public.kitchen_workspace() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.kitchen_access();w public.kitchen_wallet;
begin
 select * into w from public.kitchen_wallet where id=1;
 if not (a->>'read')::boolean then
  if not coalesce((a->>'nm')::boolean,false) then raise exception 'Kitchen responsibility or Accounts/Admin access required';end if;
  return jsonb_build_object('access',a||jsonb_build_object('handover_only',true),'wallet',to_jsonb(w),'balance',null,
   'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'role',role) order by full_name) from public.profiles where coalesce(active,true) and coalesce(is_active,true)),'[]'),
   'leaves','[]'::jsonb,'cash','[]'::jsonb,
   'funding',coalesce((select jsonb_agg(x order by x.requested_at desc) from (select * from public.kitchen_funding order by requested_at desc limit 50) x),'[]'),
   'purchases','[]'::jsonb,'stock','[]'::jsonb,'movements','[]'::jsonb,'handovers','[]'::jsonb,'reconciliations','[]'::jsonb,'audit','[]'::jsonb);
 end if;
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

-- 3. kitchen_post: same as SQL 186 except the cash handover (see the 2.16.17 comments inside).
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

-- 4. Alerts for the ERP pop-up: whose turn it is now.
--    Requested → Admin / Director · Approved → Nursing Manager · Handed over → the STD who must confirm receipt.
create or replace function public.kitchen_cash_alerts() returns table(funding_id uuid, stage text, amount numeric, purpose text,
  recipient_name text, requested_by_name text, stage_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; r text; nm boolean;
begin
 if auth.uid() is null then return;end if;
 select id,role into me,r from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(active,true) and coalesce(is_active,true) limit 1;
 if me is null then return;end if;
 nm:=public.indent_is_nursing_manager(me);
 return query
 select f.id,f.status,coalesce(f.amount,f.requested_amount),f.purpose,rp.full_name,qp.full_name,
        case f.status when 'Requested' then f.requested_at when 'Handed over' then f.handed_at else coalesce(f.handed_at,f.requested_at) end
 from public.kitchen_funding f
 left join public.profiles rp on rp.id=f.recipient
 left join public.profiles qp on qp.id=f.requested_by
 where (f.status='Requested' and r='Admin')
    or (f.status='Approved' and nm)
    or (f.status='Handed over' and f.recipient=me)
 order by f.requested_at desc limit 20;
end $$;

revoke all on function public.kitchen_access(),public.kitchen_workspace(),public.kitchen_post(uuid,text,jsonb),public.kitchen_cash_alerts() from public,anon,authenticated;
grant execute on function public.kitchen_access(),public.kitchen_workspace(),public.kitchen_post(uuid,text,jsonb),public.kitchen_cash_alerts() to authenticated;
notify pgrst,'reload schema';
commit;
