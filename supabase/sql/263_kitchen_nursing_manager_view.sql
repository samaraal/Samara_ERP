-- ERP 2.18.48 — Kitchen & Food Stores: Nursing Manager can VIEW / MONITOR the whole kitchen book.
-- The STD now handles the Kitchen & Food Stores account. The Nursing Manager gets read access to
-- everything (cash book, purchases with receipts, kitchen stock and usage, cash requests, handovers,
-- reports) so she can monitor it. She still cannot spend, record purchases, record usage, add items
-- or do any Admin step — every action check in kitchen_post / kitchen_add_items is unchanged.
-- The only action she has is the one she already had: Hand Over Cash (SQL 214).
-- Changes only kitchen_access() (based on SQL 214). Safe to run more than once.
begin;

create or replace function public.kitchen_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles:=public.kitchen_actor();w public.kitchen_wallet; pending boolean; back boolean; nm boolean; own boolean;
begin
 select * into w from public.kitchen_wallet where id=1;
 pending:=exists(select 1 from public.kitchen_handovers where status in ('Awaiting outgoing','Awaiting receipt'));
 back:=public.kitchen_return_ready();
 nm:=coalesce(public.indent_is_nursing_manager(p.id),false);
 own:=p.role in ('Admin','Accounts') or p.id in (w.primary_staff,w.custodian) or exists(select 1 from public.kitchen_handovers where to_staff=p.id and status in ('Awaiting outgoing','Awaiting receipt'));
 return jsonb_build_object(
  'read',own or nm,                -- 2.18.48: Nursing Manager reads the full kitchen book (was handover-only)
  'monitor',nm and not own,        -- 2.18.48: view / monitor only (screen shows a "view only" note)
  'admin',p.role='Admin','spend',p.id=w.custodian and not pending and not back,'actor',p.id,'name',p.full_name,'return_ready',back,'frozen',pending,
  'nm',nm);
end $$;

revoke all on function public.kitchen_access() from public,anon,authenticated;
grant execute on function public.kitchen_access() to authenticated;
notify pgrst,'reload schema';
commit;
