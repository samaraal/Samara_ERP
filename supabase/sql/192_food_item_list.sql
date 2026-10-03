-- Samara Care ERP 2.15.59 — Food item list managed by Admin (Resident Food Intake)
-- Run once in Supabase > SQL Editor (file 192). Safe to run again.
--
-- * New table food_item_list: the items shown in "＋ Add food item…" for Breakfast / Lunch / Dinner,
--   grouped as Main item / Sides / Others. Filled now with the current standard list.
-- * Admin can add, rename, reorder, remove (and restore) items from the ERP.
--   Removing only hides the item from the list — Guests' saved meal entries are NOT changed.
-- * Rows with item_group 'Hidden' hide a wrongly typed "Added earlier" item from the list.
-- * Everyone logged in can read the list; only Admin can change it.

begin;

create table if not exists public.food_item_list (
  id uuid primary key default gen_random_uuid(),
  meal_type text not null check (meal_type in ('Tiffin','Lunch','Dinner','All')),
  item_group text not null check (item_group in ('Main','Side','Other','Hidden')),
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 1000,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists food_item_list_unique_name
  on public.food_item_list (meal_type, item_group, lower(trim(name)));

alter table public.food_item_list enable row level security;
revoke all on public.food_item_list from public, anon;
grant select, insert, update, delete on public.food_item_list to authenticated;
drop policy if exists food_item_list_read on public.food_item_list;
create policy food_item_list_read on public.food_item_list for select to authenticated using (true);
drop policy if exists food_item_list_admin_write on public.food_item_list;
create policy food_item_list_admin_write on public.food_item_list for all to authenticated
  using (public.current_user_has_role(array['Admin']))
  with check (public.current_user_has_role(array['Admin']));

-- Starting list = the standard list used until now (only added once).
insert into public.food_item_list (meal_type, item_group, name, sort_order) values
  ('Tiffin','Main','Idli',10),
  ('Tiffin','Main','Dosa',20),
  ('Tiffin','Main','Ragi Dosa',30),
  ('Tiffin','Main','Millet Dosa',40),
  ('Tiffin','Main','Rava Dosa',50),
  ('Tiffin','Main','Uthappam',60),
  ('Tiffin','Main','Ven Pongal',70),
  ('Tiffin','Main','Upma',80),
  ('Tiffin','Main','Rava Kichadi',90),
  ('Tiffin','Main','Idiyappam',100),
  ('Tiffin','Main','Appam',110),
  ('Tiffin','Main','Poori',120),
  ('Tiffin','Main','Chapati',130),
  ('Tiffin','Main','Bread',140),
  ('Tiffin','Main','Oats Porridge',150),
  ('Tiffin','Main','Ragi Koozh',160),
  ('Tiffin','Main','Rice Kanji',170),
  ('Tiffin','Side','Sambar',10),
  ('Tiffin','Side','Coconut Chutney',20),
  ('Tiffin','Side','Tomato Chutney',30),
  ('Tiffin','Side','Mint Chutney',40),
  ('Tiffin','Side','Groundnut Chutney',50),
  ('Tiffin','Side','Vegetable Kurma',60),
  ('Tiffin','Side','Potato Masala',70),
  ('Tiffin','Side','Vegetable Stew',80),
  ('Tiffin','Side','Kadala Curry',90),
  ('Tiffin','Side','Gothsu',100),
  ('Tiffin','Side','Podi with Oil',110),
  ('Tiffin','Other','Boiled Egg',10),
  ('Tiffin','Other','Banana',20),
  ('Tiffin','Other','Fruit Bowl',30),
  ('Tiffin','Other','Soft Diet (Mashed)',40),
  ('Lunch','Main','Rice',10),
  ('Lunch','Main','Soft Rice',20),
  ('Lunch','Main','Millet Rice',30),
  ('Lunch','Main','Brown Rice',40),
  ('Lunch','Main','Chapati',50),
  ('Lunch','Main','Phulka',60),
  ('Lunch','Main','Vegetable Biryani',70),
  ('Lunch','Main','Lemon Rice',80),
  ('Lunch','Main','Tamarind Rice',90),
  ('Lunch','Main','Curd Rice',100),
  ('Lunch','Main','Sambar Rice',110),
  ('Lunch','Main','Rasam Rice',120),
  ('Lunch','Main','Rice Kanji',130),
  ('Lunch','Side','Sambar',10),
  ('Lunch','Side','Rasam',20),
  ('Lunch','Side','Kuzhambu',30),
  ('Lunch','Side','Dal',40),
  ('Lunch','Side','Poriyal',50),
  ('Lunch','Side','Kootu',60),
  ('Lunch','Side','Keerai',70),
  ('Lunch','Side','Avial',80),
  ('Lunch','Side','Vegetable Kurma',90),
  ('Lunch','Side','Raita',100),
  ('Lunch','Side','Curd',110),
  ('Lunch','Side','Buttermilk',120),
  ('Lunch','Side','Appalam',130),
  ('Lunch','Side','Pickle',140),
  ('Lunch','Other','Payasam',10),
  ('Lunch','Other','Banana',20),
  ('Lunch','Other','Fruit Bowl',30),
  ('Lunch','Other','Soft Diet (Mashed)',40),
  ('Dinner','Main','Idli',10),
  ('Dinner','Main','Dosa',20),
  ('Dinner','Main','Ragi Dosa',30),
  ('Dinner','Main','Millet Dosa',40),
  ('Dinner','Main','Chapati',50),
  ('Dinner','Main','Phulka',60),
  ('Dinner','Main','Idiyappam',70),
  ('Dinner','Main','Appam',80),
  ('Dinner','Main','Ven Pongal',90),
  ('Dinner','Main','Upma',100),
  ('Dinner','Main','Rice',110),
  ('Dinner','Main','Soft Rice',120),
  ('Dinner','Main','Rice Kanji',130),
  ('Dinner','Main','Bread',140),
  ('Dinner','Side','Sambar',10),
  ('Dinner','Side','Coconut Chutney',20),
  ('Dinner','Side','Tomato Chutney',30),
  ('Dinner','Side','Mint Chutney',40),
  ('Dinner','Side','Vegetable Kurma',50),
  ('Dinner','Side','Vegetable Stew',60),
  ('Dinner','Side','Potato Masala',70),
  ('Dinner','Side','Dal',80),
  ('Dinner','Side','Rasam',90),
  ('Dinner','Side','Curd',100),
  ('Dinner','Side','Buttermilk',110),
  ('Dinner','Other','Banana',10),
  ('Dinner','Other','Milk Porridge',20),
  ('Dinner','Other','Fruit Bowl',30),
  ('Dinner','Other','Soft Diet (Mashed)',40)
on conflict do nothing;

notify pgrst, 'reload schema';
commit;

-- Check: the list per meal
select meal_type, item_group, count(*) filter (where active) as active_items from public.food_item_list group by 1,2 order by 1,2;
