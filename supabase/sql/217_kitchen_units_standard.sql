-- ERP 2.16.31 — Kitchen / Food Stores: one unit per item (Kg, Litres or Nos). Run once; safe to run again.
--
-- Why: kitchen items could be saved in any of 24 units (Grams, ml, Packets, Bottles …), so the same item
-- could be kept two ways (Milk in ml and in Litres). From 2.16.31 the app buys in fixed pack sizes
-- (e.g. Milk 500 ml / 1 L) and converts to the item's one unit.
--
-- This file:
--  0. Makes sure kitchen items have their KIT- codes (the SQL 190 step — skipped if already done).
--  1. New kitchen items can be added only in Kg, Litres or Nos (kitchen_add_items).
--  2. Existing items in Grams become Kg, and items in ml become Litres — balance, low-stock level and
--     every past stock movement are divided by 1000, so nothing changes in real quantity.
--     (Skipped if the same item name already exists in Kg / Litres — listed at the end for Admin.)
--  3. Lists any item still in another unit (Packets, Bottles …) for Admin to decide.
-- Cash book, purchases (amounts) and Admin reviews are NOT changed.

begin;

-- 0. Kitchen item codes (KIT-0001 …) — same as SQL 190, included here in case 190 was not run (safe to repeat)
create sequence if not exists public.samara_kitchen_code_seq;

alter table public.kitchen_stock
  add column if not exists item_code text,
  add column if not exists active boolean not null default true,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

create or replace function public.kitchen_stock_assign_code()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if nullif(trim(coalesce(new.item_code,'')),'') is null then
    new.item_code := 'KIT-'||lpad(nextval('public.samara_kitchen_code_seq')::text,4,'0');
  end if;
  return new;
end $$;
drop trigger if exists kitchen_stock_assign_code on public.kitchen_stock;
create trigger kitchen_stock_assign_code before insert on public.kitchen_stock
  for each row execute function public.kitchen_stock_assign_code();

-- Number the existing kitchen items (alphabetical), only those without a code.
do $$
declare r record;
begin
  for r in select id from public.kitchen_stock where nullif(trim(coalesce(item_code,'')),'') is null order by lower(name), unit loop
    update public.kitchen_stock set item_code = 'KIT-'||lpad(nextval('public.samara_kitchen_code_seq')::text,4,'0') where id = r.id;
  end loop;
end $$;
create unique index if not exists kitchen_stock_item_code_key on public.kitchen_stock(item_code);

-- 1. Kitchen items: Kg, Litres or Nos only
create or replace function public.kitchen_add_items(p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles := public.kitchen_actor(); a jsonb := public.kitchen_access(); w public.kitchen_wallet;
  line jsonb; v_name text; v_unit text; v_low numeric; seen text[] := '{}'; added jsonb := '[]'; s public.kitchen_stock;
  units text[] := array['Kg','Litres','Nos'];
begin
  select * into w from public.kitchen_wallet where id = 1 for update;
  if not (coalesce((a->>'admin')::boolean,false) or p.id in (w.primary_staff, w.custodian)) then
    raise exception 'Only the kitchen in-charge or Admin can add kitchen items';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Enter 1–50 items';
  end if;
  for line in select * from jsonb_array_elements(p_items) loop
    v_name := regexp_replace(trim(coalesce(line->>'name','')), '\s+', ' ', 'g');
    v_unit := trim(coalesce(line->>'unit',''));
    v_low  := coalesce(nullif(line->>'low_level','')::numeric, 0);
    if length(v_name) < 2 then raise exception 'Every item needs a name'; end if;
    if not (v_unit = any(units)) then raise exception 'Kitchen items can only be in Kg, Litres or Nos (%)', v_name; end if;
    if v_low < 0 then raise exception 'Low-stock level cannot be negative (%)', v_name; end if;
    if lower(v_name) = any(seen) then raise exception '% is entered twice in this list', v_name; end if;
    select * into s from public.kitchen_stock where lower(name) = lower(v_name) limit 1;
    if found then raise exception '% already exists as % (%). Use the existing item.', v_name, s.item_code, s.unit; end if;
    seen := seen || lower(v_name);
    insert into public.kitchen_stock(name, unit, low_level, created_by) values (v_name, v_unit, v_low, p.id) returning * into s;
    added := added || jsonb_build_object('id', s.id, 'item_code', s.item_code, 'name', s.name, 'unit', s.unit);
  end loop;
  insert into public.kitchen_audit(action, actor, actor_name, details)
  values ('Kitchen items added', p.id, p.full_name, jsonb_build_object('items', added));
  return added;
end $$;
revoke all on function public.kitchen_add_items(jsonb) from public, anon;
grant execute on function public.kitchen_add_items(jsonb) to authenticated;

-- 2. Grams -> Kg, ml -> Litres (exact conversion, ÷ 1000)
do $$
declare r record; v_to text; changed jsonb := '[]';
begin
  for r in select * from public.kitchen_stock where unit in ('Grams','ml') order by name loop
    v_to := case r.unit when 'Grams' then 'Kg' else 'Litres' end;
    if exists (select 1 from public.kitchen_stock where name = r.name and unit = v_to) then continue; end if;
    update public.kitchen_stock_moves set quantity = round(quantity / 1000, 3) where item_id = r.id;
    update public.kitchen_stock set unit = v_to, quantity = round(r.quantity / 1000, 3), low_level = round(r.low_level / 1000, 3) where id = r.id;
    changed := changed || jsonb_build_object('item_code', r.item_code, 'name', r.name, 'from', r.quantity||' '||r.unit, 'to', round(r.quantity/1000,3)||' '||v_to);
  end loop;
  if jsonb_array_length(changed) > 0 then
    insert into public.kitchen_audit(action, actor_name, details)
    values ('Kitchen units standardised (SQL 217)', 'System', jsonb_build_object('items', changed));
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

-- 3. Check: items NOT yet in Kg / Litres / Nos (decide each one — e.g. rename to the standard item, or
--    ask Claude for a one-time fix). Empty result = all kitchen items are standard.
select item_code, name, unit, quantity, low_level,
       case when unit in ('Grams','ml') then 'Same name already exists in Kg / Litres — merge needed'
            else 'Old unit — choose Kg, Litres or Nos' end as note
from public.kitchen_stock where unit not in ('Kg','Litres','Nos') order by item_code;
