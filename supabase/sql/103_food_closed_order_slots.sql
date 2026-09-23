-- Closed orders retain their history and charges but do not reserve a meal slot.
begin;
lock table public.fv_orders in share row exclusive mode;
drop index if exists public.fv_order_slot;
create unique index fv_order_slot on public.fv_orders((data->>'date'),(data->>'slot'),(data->>'vendor_id')) where status <> 'Closed';
commit;
-- Expected: index definition ends with WHERE (status <> 'Closed'::text).
select indexdef from pg_indexes where schemaname='public' and indexname='fv_order_slot';
