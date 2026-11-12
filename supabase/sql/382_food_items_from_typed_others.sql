-- ERP 2.20.48 — Food & Beverage: items staff typed under "Other" (153 meals checked, 12-11-2026) added to the dropdown list
-- with the correct spelling. Combinations already covered by separate list items (e.g. "Idli with sambar and chutney",
-- "Rasam satham" = Rasam Rice) and drinks (Milk / Coconut Milk — record them in ☕ Beverage) are not added.
-- Run once; safe to run again (an item already in that meal's list is skipped; a removed one is restored).
begin;
with add(meal_type, item_group, name) as (values
  ('Tiffin','Side','Medu Vada'),
  ('Lunch','Main','Curry Leaves Rice'),
  ('Lunch','Main','Millet Kanji'),
  ('Lunch','Side','Carrot Poriyal'),
  ('Lunch','Side','Cluster Beans Poriyal'),
  ('Lunch','Side','Kovakkai Poriyal'),
  ('Lunch','Side','Potato Fry'),
  ('Lunch','Side','Pudalangai Kootu'),
  ('Lunch','Side','Fish Kuzhambu'),
  ('Lunch','Side','Chicken Gravy'),
  ('Lunch','Other','Boiled Egg'),
  ('Dinner','Main','Millet Kanji'),
  ('Dinner','Side','Chicken Gravy'),
  ('Dinner','Other','Fresubin (Nutrition Supplement)')
), restored as (
  update public.food_item_list f set active = true, updated_at = now()
    from add a where f.meal_type = a.meal_type and lower(trim(f.name)) = lower(a.name) and f.item_group <> 'Hidden' and not f.active
  returning f.id
)
insert into public.food_item_list(meal_type, item_group, name, sort_order)
select a.meal_type, a.item_group, a.name,
       coalesce((select max(sort_order) from public.food_item_list f where f.meal_type = a.meal_type and f.item_group = a.item_group), 0) + 10 * row_number() over (partition by a.meal_type, a.item_group order by a.name)
  from add a
 where not exists (select 1 from public.food_item_list f where f.meal_type = a.meal_type and lower(trim(f.name)) = lower(a.name) and f.item_group <> 'Hidden');
commit;

select meal_type, item_group, name from public.food_item_list
 where lower(name) in ('medu vada','curry leaves rice','millet kanji','carrot poriyal','cluster beans poriyal','kovakkai poriyal','potato fry',
                       'pudalangai kootu','fish kuzhambu','chicken gravy','boiled egg','fresubin (nutrition supplement)') order by meal_type, item_group, name;
