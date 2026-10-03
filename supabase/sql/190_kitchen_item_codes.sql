-- Samara Care ERP 2.15.55 — Kitchen / Food Stores item list with automatic codes
-- Run once in Supabase > SQL Editor (file 190), after 186. Safe to run again.
--
-- * Every kitchen stock item gets an automatic code KIT-0001, KIT-0002 … (same KIT- series as
--   Stores, so a code is never used twice). Existing kitchen items are numbered now (A–Z order).
-- * New function kitchen_add_items: add several items in one save (name + unit + optional
--   low-stock level). Duplicate names are refused.
-- * Purchases now pick items from this list, so the same item is never typed two ways.
-- Cash, purchases and stock balances are NOT changed.

begin;

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

-- Add one or many kitchen items at once. p_items = [{"name":"Rice","unit":"Kg","low_level":5}, …]
create or replace function public.kitchen_add_items(p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles := public.kitchen_actor(); a jsonb := public.kitchen_access(); w public.kitchen_wallet;
  line jsonb; v_name text; v_unit text; v_low numeric; seen text[] := '{}'; added jsonb := '[]'; s public.kitchen_stock;
  units text[] := array['Nos','Pieces','Pairs','Sets','Packs','Packets','Boxes','Rolls','Bottles','Strips','Tablets','Capsules','Vials','Ampoules','Tubes','Sachets','Inhalers','Kg','Grams','Litres','ml','Dozens','Cans','Cylinders'];
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
    if not (v_unit = any(units)) then raise exception 'Choose the unit from the list for %', v_name; end if;
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

notify pgrst, 'reload schema';
commit;

-- Check: the kitchen item list with codes
select item_code, name, unit, quantity, low_level from public.kitchen_stock order by item_code;
