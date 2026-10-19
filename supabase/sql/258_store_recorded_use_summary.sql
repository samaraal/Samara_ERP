-- Samara Care ERP 2.18.39 — Backup & Fresh Start: recorded Guest use summed on the server
-- The check table (step 2) read every Stock Movement row into the browser and timed out
-- ("consumable_store_ledger: canceling statement due to statement timeout"). This returns one row per item instead.
-- Read-only. Safe to run again.
create or replace function public.store_recorded_use_summary(p_sections text[])
returns table(item_id uuid, used_net numeric, balance numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $function$
  select l.item_id,
         coalesce(sum(case when l.movement_type in ('Patient Issue','Department Issue') then l.qty_out-l.qty_in
                           when l.movement_type='Return to Store' then l.qty_out-l.qty_in else 0 end),0) as used_net,
         coalesce(sum(l.qty_in-l.qty_out),0) as balance
  from public.consumable_store_ledger l
  join public.consumable_store_items i on i.id=l.item_id
  where l.voided_at is null
    and coalesce(i.item_category,'Consumables') = any (p_sections)
    and exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true))
  group by l.item_id
$function$;
revoke all on function public.store_recorded_use_summary(text[]) from public, anon;
grant execute on function public.store_recorded_use_summary(text[]) to authenticated;
create index if not exists consumable_store_ledger_item_idx on public.consumable_store_ledger(item_id);
notify pgrst,'reload schema';

-- check: should return  true
select exists(select 1 from pg_proc where proname='store_recorded_use_summary') as recorded_use_summary_ready;
