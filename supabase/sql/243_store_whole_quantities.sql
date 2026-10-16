-- Stock counts are whole numbers. Currency rates and amounts retain decimals.
-- Existing fractional records are retained for item-by-item reconciliation;
-- an unrelated edit does not silently round or invalidate historical quantities.
begin;
alter table public.consumable_store_receipts add column if not exists voided_at timestamptz;
alter table public.consumable_store_receipts add column if not exists void_reason text;
alter table public.consumable_store_ledger add column if not exists voided_at timestamptz;
alter table public.consumable_store_ledger add column if not exists void_reason text;

create or replace function public.store_require_whole_quantity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare col text; value numeric; changed boolean;
begin
 foreach col in array tg_argv loop
  changed:=tg_op='INSERT';
  if tg_op='UPDATE' then changed:=(to_jsonb(new)->col) is distinct from (to_jsonb(old)->col); end if;
  if changed and to_jsonb(new)->>col is not null then
   value:=(to_jsonb(new)->>col)::numeric;
   if value::text in ('NaN','Infinity','-Infinity') or value<>trunc(value) then
    raise exception 'Stores quantities must be whole numbers; decimals are not allowed (%).',col;
   end if;
  end if;
 end loop;
 return new;
end $$;

do $$
declare spec record; args text; col text;
begin
 for spec in select * from (values
  ('consumable_store_items',array['reorder_level']),
  ('consumable_store_receipts',array['quantity']),
  ('consumable_store_ledger',array['qty_in','qty_out']),
  ('patient_consumable_indents',array['requested_qty','approved_qty','handed_over_qty','received_qty','outside_used_qty','outside_wastage_qty']),
  ('patient_store_returns',array['quantity']),
  ('patient_item_consumption',array['quantity']),
  ('housekeeping_indents',array['requested_qty','approved_qty','handed_over_qty','received_qty']),
  ('housekeeping_item_usage',array['quantity'])
 ) s(tab,cols) loop
  args:='';
  foreach col in array spec.cols loop
   if exists(select 1 from information_schema.columns where table_schema='public' and table_name=spec.tab and column_name=col) then
    args:=args||case when args='' then '' else ',' end||quote_literal(col);
   end if;
  end loop;
  execute format('drop trigger if exists store_whole_quantity on public.%I',spec.tab);
  execute format('create trigger store_whole_quantity before insert or update on public.%I for each row execute function public.store_require_whole_quantity(%s)',spec.tab,args);
 end loop;
end $$;
create or replace view public.consumable_store_stock with (security_invoker=true) as
 SELECT i.id AS item_id,
    i.item_name,
    i.unit,
    i.reorder_level,
    i.active,
    COALESCE(sum(l.qty_in), 0::numeric)::numeric(12,2) AS total_in,
    COALESCE(sum(l.qty_out), 0::numeric)::numeric(12,2) AS total_out,
    (COALESCE(sum(l.qty_in), 0::numeric) - COALESCE(sum(l.qty_out), 0::numeric))::numeric(12,2) AS balance_qty,
    max(l.movement_at) AS last_movement_at
   FROM consumable_store_items i
     LEFT JOIN consumable_store_ledger l ON l.item_id = i.id AND l.voided_at IS NULL
  GROUP BY i.id, i.item_name, i.unit, i.reorder_level, i.active;
create or replace function public.current_consumable_stock(p_item_id uuid) returns numeric language sql stable security definer set search_path=public as 'select coalesce(sum(qty_in-qty_out),0)::numeric from public.consumable_store_ledger where item_id=p_item_id and voided_at is null';
commit;
