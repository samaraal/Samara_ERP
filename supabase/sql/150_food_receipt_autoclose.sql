-- Samara ERP v2.14.59
-- Food & Diet: an order sitting at "Pending receipt" was easy to miss -- nothing
-- ever nudged staff to log the actual delivery, so it could sit open indefinitely.
-- This adds, additively, a fixed window after the order's own delivery time:
--   0-2h   normal window, no action
--   2h-3h  reminder window (surfaced in Notifications for Nurse Manager/Admin/Director;
--          see 06-bell-notifications-popups.js -- no WhatsApp, in-app only)
--   3h+    auto-closed as not received; billing already treats a Closed order with
--          no receipts as excluded (see mealSummary in food-vendor-core.js), so this
--          needs no separate accounts change -- it simply stops charging for it.
-- Does not touch fv_rpc, fv_access or any existing action; only adds a new
-- scheduled function that mirrors the manual "close" action's own effect.
begin;

create or replace function public.fv_auto_close_overdue_receipts(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 with due as (
  select id from public.fv_orders
  where status in ('Ordered','Partial')
   and p_now >= (((data->>'date')||' '||(data->>'delivery'))::timestamp at time zone 'Asia/Kolkata') + interval '3 hours'
  for update
 ), closed as (
  update public.fv_orders o set status='Closed',version=version+1
  from due where due.id=o.id
  returning o.id
 )
 insert into public.fv_events(order_id,kind,data,actor)
 select id,'close',
  jsonb_build_object('reason','Automatically closed: no full receipt recorded within 3 hours of the delivery time (2-hour entry window plus 1-hour grace period).','auto',true),
  '00000000-0000-0000-0000-000000000000'::uuid
 from closed;
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function public.fv_auto_close_overdue_receipts(timestamptz) from public, anon, authenticated;

select cron.schedule('samara-food-receipt-autoclose','* * * * *','select public.fv_auto_close_overdue_receipts();');
select jobid,jobname,schedule,active from cron.job where jobname='samara-food-receipt-autoclose';

commit;
