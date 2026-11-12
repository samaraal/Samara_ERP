-- ERP 2.20.49 — Food item CATEGORIES (Lunch side dishes): choose the category (e.g. Poriyal), then which one.
-- Adds food_item_list.category; items with a category are shown under it in "Add food item" (a second list opens).
-- Lunch side dishes added from the list given by Admin on 12-11-2026: Poriyal, Kootu, Aviyal / Thoran / Erissery,
-- Keerai, Paruppu Usili, Pachadi & Raita, Thogayal, Crispy Sides & Condiments. The old one-word items Poriyal, Kootu,
-- Keerai, Raita and Pickle are removed from the list (the categories replace them; saved meals keep their text).
-- Run once; safe to run again.
begin;
alter table public.food_item_list add column if not exists category text;

-- same items under the new full names (keeps their ids)
do $$ begin
  update public.food_item_list set name = 'Kovakkai (Ivy Gourd) Poriyal', updated_at = now() where meal_type = 'Lunch' and item_group = 'Side' and lower(trim(name)) = lower('Kovakkai Poriyal')
    and not exists(select 1 from public.food_item_list x where x.meal_type = 'Lunch' and x.item_group = 'Side' and lower(trim(x.name)) = lower('Kovakkai (Ivy Gourd) Poriyal'));
  update public.food_item_list set name = 'Kothavarangai (Cluster Beans) Poriyal', updated_at = now() where meal_type = 'Lunch' and item_group = 'Side' and lower(trim(name)) = lower('Cluster Beans Poriyal')
    and not exists(select 1 from public.food_item_list x where x.meal_type = 'Lunch' and x.item_group = 'Side' and lower(trim(x.name)) = lower('Kothavarangai (Cluster Beans) Poriyal'));
  update public.food_item_list set name = 'Urulaikizhangu (Potato) Roast / Fry', updated_at = now() where meal_type = 'Lunch' and item_group = 'Side' and lower(trim(name)) = lower('Potato Fry')
    and not exists(select 1 from public.food_item_list x where x.meal_type = 'Lunch' and x.item_group = 'Side' and lower(trim(x.name)) = lower('Urulaikizhangu (Potato) Roast / Fry'));
  update public.food_item_list set name = 'Pudalangai (Snake Gourd) Kootu', updated_at = now() where meal_type = 'Lunch' and item_group = 'Side' and lower(trim(name)) = lower('Pudalangai Kootu')
    and not exists(select 1 from public.food_item_list x where x.meal_type = 'Lunch' and x.item_group = 'Side' and lower(trim(x.name)) = lower('Pudalangai (Snake Gourd) Kootu'));
  update public.food_item_list set name = 'Appalam / Papad', updated_at = now() where meal_type = 'Lunch' and item_group = 'Side' and lower(trim(name)) = lower('Appalam')
    and not exists(select 1 from public.food_item_list x where x.meal_type = 'Lunch' and x.item_group = 'Side' and lower(trim(x.name)) = lower('Appalam / Papad'));
  update public.food_item_list set name = 'Aviyal (Mixed Vegetable)', updated_at = now() where meal_type = 'Lunch' and item_group = 'Side' and lower(trim(name)) = lower('Avial')
    and not exists(select 1 from public.food_item_list x where x.meal_type = 'Lunch' and x.item_group = 'Side' and lower(trim(x.name)) = lower('Aviyal (Mixed Vegetable)'));
end $$;

insert into public.food_item_list(meal_type, item_group, category, name, sort_order, active)
select 'Lunch', 'Side', v.category, v.name, v.ord, true from (values
  ('Poriyal','Beans Poriyal',1010),
  ('Poriyal','Carrot Poriyal',1020),
  ('Poriyal','Cabbage Poriyal',1030),
  ('Poriyal','Beetroot Poriyal',1040),
  ('Poriyal','Vendakkai (Okra) Poriyal',1050),
  ('Poriyal','Vazhakkai (Raw Banana) Poriyal',1060),
  ('Poriyal','Vazhakkai (Raw Banana) Podimas',1070),
  ('Poriyal','Kovakkai (Ivy Gourd) Poriyal',1080),
  ('Poriyal','Kothavarangai (Cluster Beans) Poriyal',1090),
  ('Poriyal','Pudalangai (Snake Gourd) Poriyal',1100),
  ('Poriyal','Peerkangai (Ridge Gourd) Poriyal',1110),
  ('Poriyal','Urulaikizhangu (Potato) Roast / Fry',1120),
  ('Poriyal','Seppankizhangu (Taro Root) Roast',1130),
  ('Poriyal','Senai Kizhangu (Elephant Yam) Fry',1140),
  ('Poriyal','Kathirikkai (Brinjal) Fry',1150),
  ('Poriyal','Ennai Kathirikkai',1160),
  ('Kootu','Chow Chow Kootu',1170),
  ('Kootu','Cabbage Kootu',1180),
  ('Kootu','Sorakkai (Bottle Gourd) Kootu',1190),
  ('Kootu','Parangikkai (Yellow Pumpkin) Kootu',1200),
  ('Kootu','Poosanikai (Ash Gourd) Kootu',1210),
  ('Kootu','Vazhaithandu (Banana Stem) Kootu',1220),
  ('Kootu','Pudalangai (Snake Gourd) Kootu',1230),
  ('Kootu','Keerai Molagootal (Greens & Dal)',1240),
  ('Kootu','Mixed Vegetable Kootu',1250),
  ('Aviyal, Thoran & Erissery','Aviyal (Mixed Vegetable)',1260),
  ('Aviyal, Thoran & Erissery','Cabbage Thoran',1270),
  ('Aviyal, Thoran & Erissery','Carrot & Beans Thoran',1280),
  ('Aviyal, Thoran & Erissery','Beetroot Thoran',1290),
  ('Aviyal, Thoran & Erissery','Mathanga Erissery (Pumpkin & Red Beans)',1300),
  ('Aviyal, Thoran & Erissery','Kaya Erissery (Raw Banana & Yam)',1310),
  ('Keerai (Greens)','Keerai Masiyal (Mashed Greens)',1320),
  ('Keerai (Greens)','Keerai Poriyal / Thuvaram',1330),
  ('Keerai (Greens)','Murungai Keerai (Drumstick Leaves) Poriyal',1340),
  ('Keerai (Greens)','Keerai Kootu',1350),
  ('Keerai (Greens)','Palak Keerai',1360),
  ('Keerai (Greens)','Siru Keerai',1370),
  ('Keerai (Greens)','Mulai Keerai',1380),
  ('Keerai (Greens)','Arai Keerai',1390),
  ('Paruppu Usili','Kothavarangai (Cluster Beans) Usili',1400),
  ('Paruppu Usili','Vazhaipoo (Banana Blossom) Usili',1410),
  ('Paruppu Usili','Beans Usili',1420),
  ('Paruppu Usili','Cabbage Usili',1430),
  ('Pachadi & Raita','Vellarikkai (Cucumber) Thayir Pachadi',1440),
  ('Pachadi & Raita','Onion & Tomato Raita',1450),
  ('Pachadi & Raita','Vendakkai (Okra) Pachadi',1460),
  ('Pachadi & Raita','Pineapple Pachadi',1470),
  ('Pachadi & Raita','Mango Pachadi',1480),
  ('Pachadi & Raita','Beetroot Pachadi',1490),
  ('Thogayal','Thengai (Coconut) Thogayal',1500),
  ('Thogayal','Paruppu (Toor Dal) Thogayal',1510),
  ('Thogayal','Karuveppilai (Curry Leaves) Thogayal',1520),
  ('Thogayal','Kothamalli (Coriander) Thogayal',1530),
  ('Thogayal','Pudina (Mint) Thogayal',1540),
  ('Thogayal','Pirandai Thogayal',1550),
  ('Crispy Sides & Condiments','Appalam / Papad',1560),
  ('Crispy Sides & Condiments','Sundakkai Vathal (Turkey Berry)',1570),
  ('Crispy Sides & Condiments','Kothavarangai Vathal (Cluster Beans)',1580),
  ('Crispy Sides & Condiments','Pavakkai Vathal (Bitter Gourd)',1590),
  ('Crispy Sides & Condiments','Koozh Vadagam / Rice Crisps',1600),
  ('Crispy Sides & Condiments','Mango Oorugai (Pickle)',1610),
  ('Crispy Sides & Condiments','Lemon Oorugai (Pickle)',1620),
  ('Crispy Sides & Condiments','Narthangai (Citron) Oorugai',1630),
  ('Crispy Sides & Condiments','Mor Milagai (Curd Chillies)',1640)
) v(category, name, ord)
on conflict (meal_type, item_group, lower(trim(name))) do update set category = excluded.category, active = true, sort_order = excluded.sort_order, updated_at = now();

update public.food_item_list set active = false, updated_at = now()
 where meal_type = 'Lunch' and item_group = 'Side' and category is null and lower(trim(name)) in ('poriyal','kootu','keerai','raita','pickle');

notify pgrst, 'reload schema';
commit;

select category, count(*) as items from public.food_item_list where meal_type = 'Lunch' and item_group = 'Side' and active group by category order by category nulls first;
