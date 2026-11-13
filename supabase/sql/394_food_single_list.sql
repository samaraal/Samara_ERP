-- ERP 2.20.64 — Food & Beverage: ONE food item list for Breakfast, Lunch and Dinner (list approved by Admin, 13-11-2026)
-- * The dropdown no longer changes with the meal: one list, grouped under headings
--   (Tiffin items, Rice, Chutney & Tiffin Sides, Kuzhambu / Gravy, Kootu, Poriyal, Aviyal, Accompaniments, Non-veg, Others).
-- * Stored as meal_type 'All', item_group 'Main', heading in "category".
-- * The old per-meal rows (Tiffin / Lunch / Dinner) are only switched OFF (active = false) — never deleted;
--   Guests' saved meal entries keep their text.
-- * New function add_food_item_from_staff(name): when staff type an item under "Not in the list",
--   it is added to the list (heading "Others") for everyone. Duplicate check is case-insensitive
--   ("idli" = "Idli" = " IDLI "). An item Admin removed or hid is not brought back by staff.
-- Run once in Supabase > SQL Editor. Safe to run again.
begin;

alter table public.food_item_list add column if not exists category text;

-- 1. switch off the old per-meal lists
update public.food_item_list set active = false, updated_at = now()
 where meal_type in ('Tiffin','Lunch','Dinner') and active;

-- 2. the single list
insert into public.food_item_list(meal_type, item_group, category, name, sort_order, active)
select 'All', 'Main', v.category, v.name, v.ord, true from (values
  ('Tiffin Items','Idli',1010),
  ('Tiffin Items','Dosa',1020),
  ('Tiffin Items','Adai',1030),
  ('Tiffin Items','Ven Pongal',1040),
  ('Tiffin Items','Rava Upma',1050),
  ('Tiffin Items','Semiya Upma',1060),
  ('Tiffin Items','Idiyappam',1070),
  ('Tiffin Items','Appam',1080),
  ('Tiffin Items','Poori',1090),
  ('Tiffin Items','Chapati',1100),
  ('Tiffin Items','Ragi Koozh',1110),
  ('Tiffin Items','Kanji (Rice Porridge)',1120),
  ('Tiffin Items','Ragi Kanji',1130),
  ('Tiffin Items','Oats Porridge',1140),
  ('Rice','White Rice',2010),
  ('Rice','Lemon Rice',2020),
  ('Rice','Tomato Rice',2030),
  ('Rice','Curd Rice',2040),
  ('Rice','Vegetable Biryani',2050),
  ('Chutney & Tiffin Sides','Coconut Chutney',3010),
  ('Chutney & Tiffin Sides','Tomato Chutney',3020),
  ('Chutney & Tiffin Sides','Kara Chutney',3030),
  ('Chutney & Tiffin Sides','Potato Masala',3040),
  ('Chutney & Tiffin Sides','Veg Kurma',3050),
  ('Chutney & Tiffin Sides','Vada Curry',3060),
  ('Chutney & Tiffin Sides','Coconut Milk',3070),
  ('Kuzhambu / Gravy','Sambar',4010),
  ('Kuzhambu / Gravy','Rasam',4020),
  ('Kuzhambu / Gravy','Paruppu (Dal)',4030),
  ('Kuzhambu / Gravy','Kara Kuzhambu',4040),
  ('Kuzhambu / Gravy','Vathal Kuzhambu',4050),
  ('Kuzhambu / Gravy','Mor Kuzhambu',4060),
  ('Kootu','Keerai Kootu',5010),
  ('Kootu','Mixed Veg Kootu',5020),
  ('Kootu','Poosanikai (Ash Gourd) Kootu',5030),
  ('Kootu','Sorakkai (Bottle Gourd) Kootu',5040),
  ('Kootu','Pudalangai (Snake Gourd) Kootu',5050),
  ('Kootu','Peerkangai (Ridge Gourd) Kootu',5060),
  ('Kootu','Chow Chow Kootu',5070),
  ('Kootu','Cabbage Kootu',5080),
  ('Kootu','Avarakkai Kootu',5090),
  ('Kootu','Kathirikai Kootu',5100),
  ('Poriyal','Beans Poriyal',6010),
  ('Poriyal','Cabbage Poriyal',6020),
  ('Poriyal','Carrot Poriyal',6030),
  ('Poriyal','Carrot-Beans Poriyal',6040),
  ('Poriyal','Beetroot Poriyal',6050),
  ('Poriyal','Keerai Poriyal',6060),
  ('Poriyal','Avarakkai Poriyal',6070),
  ('Poriyal','Vazhakkai Poriyal',6080),
  ('Poriyal','Kovakkai Poriyal',6090),
  ('Poriyal','Vendakkai Poriyal',6100),
  ('Poriyal','Chow Chow Poriyal',6110),
  ('Poriyal','Potato Fry',6120),
  ('Aviyal','Aviyal (Mixed Veg)',7010),
  ('Aviyal','Vazhakkai Aviyal',7020),
  ('Aviyal','Senai (Yam) Aviyal',7030),
  ('Accompaniments','Curd',8010),
  ('Accompaniments','Buttermilk',8020),
  ('Accompaniments','Appalam',8030),
  ('Accompaniments','Pickle',8040),
  ('Non-veg','Chicken Curry',9010),
  ('Non-veg','Fish Curry',9020),
  ('Non-veg','Egg Curry',9030),
  ('Non-veg','Boiled Egg',9040)
) v(category, name, ord)
on conflict (meal_type, item_group, lower(trim(name)))
do update set category = excluded.category, sort_order = excluded.sort_order, active = true, updated_at = now();

-- 3. staff add a typed item ("Not in the list") to the single list — case-insensitive duplicate check
create or replace function public.add_food_item_from_staff(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_row public.food_item_list%rowtype;
  v_ord integer;
begin
  if auth.uid() is null then raise exception 'Sign in again.'; end if;
  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'Enter the food item name (2 to 60 letters).'; end if;

  -- hidden by Admin (wrong spelling) → not added
  if exists (select 1 from public.food_item_list where item_group = 'Hidden' and lower(trim(name)) = lower(v_name)) then
    return jsonb_build_object('status','hidden','name',v_name);
  end if;

  -- already in the single list (any capitals / spaces) → use that spelling
  select * into v_row from public.food_item_list
   where meal_type = 'All' and item_group <> 'Hidden' and lower(trim(name)) = lower(v_name)
   limit 1;
  if found then
    return jsonb_build_object('status', case when v_row.active then 'exists' else 'removed' end, 'name', v_row.name);
  end if;

  select coalesce(max(sort_order), 9900) + 10 into v_ord from public.food_item_list
   where meal_type = 'All' and item_group = 'Main' and category = 'Others';
  insert into public.food_item_list(meal_type, item_group, category, name, sort_order, active, created_by, updated_by)
  values ('All','Main','Others', v_name, greatest(v_ord, 9910), true, auth.uid(), auth.uid())
  on conflict (meal_type, item_group, lower(trim(name))) do nothing;
  return jsonb_build_object('status','added','name',v_name);
end $$;

revoke all on function public.add_food_item_from_staff(text) from public, anon;
grant execute on function public.add_food_item_from_staff(text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select category, count(*) as items from public.food_item_list where meal_type = 'All' and item_group = 'Main' and active
 group by category order by min(sort_order);
