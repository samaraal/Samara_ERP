-- Samara ERP v2.15.61
-- Food Vendor Management: late receipt entry for auto-closed orders.
--
-- Problem: SQL 150 auto-closes any food order with no full receipt 3 hours after
-- its delivery time. If staff forget to press "Receive", the order becomes Closed
-- and the food that actually came is never billed (statements charge received
-- portions only), and there was no way to reopen it.
--
-- Fix (additive; fv_rpc is NOT modified):
--   1. fv_reopen_late_receipt(order, version, reason) -- Admin/Director only.
--      Reopens a Closed (not cancelled) order from the last 30 days for a 24-hour
--      late-entry window. It goes back to Ordered (or Partial if part was already
--      received), so the normal "Receive" action records the real quantities and
--      the usual billing / ledger entries are created for the original supply date.
--   1b. fv_reopen_late_receipts_bulk(from, to, reason) -- Admin/Director: reopens all
--      AUTO-closed orders in a period at once, for 48 hours.
--   2. fv_auto_close_overdue_receipts skips orders while their late-entry window
--      is open; after the window it closes them again as before.
-- Every reopen is logged in the order history (event kind 'reopen') with the
-- reason and who did it.
begin;

create or replace function public.fv_reopen_late_receipt(p_order_id uuid, p_version integer, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb; o public.fv_orders; has_receipt boolean; until_at timestamptz := now() + interval '24 hours';
begin
 a := public.fv_access();
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Only Admin/Director can reopen an order for late receipt entry';end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Reason required (for example: staff forgot to enter receipt)';end if;
 select * into o from public.fv_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if o.version<>coalesce(p_version,-1) then raise exception 'Order changed. Refresh and review before saving';end if;
 if o.status<>'Closed' then raise exception 'Only a Closed order can be reopened for late receipt';end if;
 if coalesce((o.data->>'cancelled')::boolean,false) then raise exception 'A cancelled order cannot be reopened';end if;
 if (o.data->>'date')::date < (now() at time zone 'Asia/Kolkata')::date - 30 then raise exception 'Only orders from the last 30 days can be reopened';end if;
 if exists(select 1 from public.fv_orders x where x.id<>o.id and x.status<>'Closed'
   and x.data->>'date'=o.data->>'date' and x.data->>'slot'=o.data->>'slot'
   and coalesce(x.data->>'vendor_id','')=coalesce(o.data->>'vendor_id','')
   and coalesce(x.data->>'place_key','main')=coalesce(o.data->>'place_key','main')) then
  raise exception 'Another open order already exists for this date, meal and place. Record the receipt on that order instead';
 end if;
 has_receipt := exists(select 1 from public.fv_events where order_id=o.id and kind='receive');
 update public.fv_orders
   set status=case when has_receipt then 'Partial' else 'Ordered' end,
       version=version+1,
       data=data||jsonb_build_object('late_receipt_until',until_at,'late_reopened_at',now(),'late_reopen_reason',trim(p_reason))
   where id=o.id returning * into o;
 insert into public.fv_events(order_id,kind,data,actor)
  values(o.id,'reopen',jsonb_build_object('reason',trim(p_reason),'late_receipt_until',until_at),auth.uid());
 return jsonb_build_object('id',o.id,'version',o.version,'status',o.status,'late_receipt_until',until_at);
end $$;
revoke all on function public.fv_reopen_late_receipt(uuid,integer,text) from public,anon;
grant execute on function public.fv_reopen_late_receipt(uuid,integer,text) to authenticated;

-- Bulk: reopen every AUTO-closed order (never cancelled, never manually closed) whose
-- supply date is in the period, for a 48-hour late-entry window. Admin/Director only.
create or replace function public.fv_reopen_late_receipts_bulk(p_from date, p_to date, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb; o public.fv_orders; n integer:=0; skipped integer:=0; until_at timestamptz := now() + interval '48 hours'; has_receipt boolean;
begin
 a := public.fv_access();
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Only Admin/Director can reopen orders for late receipt entry';end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Reason required';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Select a valid From–To period';end if;
 if p_from < (now() at time zone 'Asia/Kolkata')::date - 30 then raise exception 'Only orders from the last 30 days can be reopened';end if;
 for o in
  select * from public.fv_orders x
  where x.status='Closed' and not coalesce((x.data->>'cancelled')::boolean,false)
   and (x.data->>'date')::date between p_from and p_to
   and coalesce((select (e.data->>'auto')::boolean from public.fv_events e where e.order_id=x.id and e.kind='close' order by e.created_at desc limit 1),false)
  order by x.data->>'date', x.data->>'slot'
  for update
 loop
  if exists(select 1 from public.fv_orders y where y.id<>o.id and y.status<>'Closed'
    and y.data->>'date'=o.data->>'date' and y.data->>'slot'=o.data->>'slot'
    and coalesce(y.data->>'vendor_id','')=coalesce(o.data->>'vendor_id','')
    and coalesce(y.data->>'place_key','main')=coalesce(o.data->>'place_key','main')) then
   skipped:=skipped+1; continue;
  end if;
  has_receipt := exists(select 1 from public.fv_events where order_id=o.id and kind='receive');
  update public.fv_orders
    set status=case when has_receipt then 'Partial' else 'Ordered' end, version=version+1,
        data=data||jsonb_build_object('late_receipt_until',until_at,'late_reopened_at',now(),'late_reopen_reason',trim(p_reason))
    where id=o.id;
  insert into public.fv_events(order_id,kind,data,actor)
   values(o.id,'reopen',jsonb_build_object('reason',trim(p_reason),'late_receipt_until',until_at,'bulk',true),auth.uid());
  n:=n+1;
 end loop;
 return jsonb_build_object('reopened',n,'skipped',skipped,'late_receipt_until',until_at);
end $$;
revoke all on function public.fv_reopen_late_receipts_bulk(date,date,text) from public,anon;
grant execute on function public.fv_reopen_late_receipts_bulk(date,date,text) to authenticated;

create or replace function public.fv_auto_close_overdue_receipts(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 with due as (
  select id from public.fv_orders
  where status in ('Ordered','Partial')
   and p_now >= (((data->>'date')||' '||(data->>'delivery'))::timestamp at time zone 'Asia/Kolkata') + interval '3 hours'
   and not (coalesce(data->>'late_receipt_until','') <> '' and p_now < (data->>'late_receipt_until')::timestamptz)
  for update
 ), closed as (
  update public.fv_orders o set status='Closed',version=version+1
  from due where due.id=o.id
  returning o.id, (o.data->>'late_receipt_until') is not null as was_late
 )
 insert into public.fv_events(order_id,kind,data,actor)
 select id,'close',
  jsonb_build_object('reason',case when was_late
    then 'Automatically closed: late-receipt entry window ended.'
    else 'Automatically closed: no full receipt recorded within 3 hours of the delivery time (2-hour entry window plus 1-hour grace period).' end,'auto',true),
  '00000000-0000-0000-0000-000000000000'::uuid
 from closed;
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function public.fv_auto_close_overdue_receipts(timestamptz) from public, anon, authenticated;

commit;

-- Optional check: auto-closed orders of the last 10 days with no receipt
-- select id, data->>'date' as date, data->>'slot' as meal, coalesce(data->>'place_key','main') as place
-- from public.fv_orders o where status='Closed' and not coalesce((data->>'cancelled')::boolean,false)
--  and (data->>'date')::date >= current_date-10
--  and not exists(select 1 from public.fv_events e where e.order_id=o.id and e.kind='receive')
-- order by 2,3;
