-- ERP 2.20.65 — Food & Beverage: clear the "Others" heading of the single food list (asked by Admin, 13-11-2026).
-- Items typed by staff from now on are added to Others again (add_food_item_from_staff, SQL 394).
-- Only the list rows are removed — Guests' saved meal entries keep their text.
-- Run once in Supabase > SQL Editor. Safe to run again.
begin;
delete from public.food_item_list where meal_type = 'All' and item_group = 'Main' and category = 'Others';
commit;

-- Check: should be 0
select count(*) as others_items from public.food_item_list where meal_type = 'All' and category = 'Others';
