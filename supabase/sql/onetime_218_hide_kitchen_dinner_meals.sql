-- ERP 2.16.32 — one-time: hide kitchen item KIT-0001 "Dinner" (unit "Meals") from the kitchen lists.
-- Meals come through Food Vendor Management, not Kitchen / Food Stores. Run once; safe to run again.
-- Nothing is deleted: the old purchase, cash-book and stock-movement entries stay in history unchanged.
-- A meal bought with kitchen petty cash in future is recorded as "Other expense (not a stock item)".

begin;

update public.kitchen_stock
   set active = false
 where item_code = 'KIT-0001' and name = 'Dinner' and unit = 'Meals' and active is distinct from false;

insert into public.kitchen_audit(action, actor_name, details)
select 'Kitchen item hidden (SQL 218)', 'System',
       jsonb_build_object('item_code', item_code, 'name', name, 'unit', unit, 'quantity', quantity,
                          'reason', 'Meals belong to Food Vendor Management, not kitchen stock')
  from public.kitchen_stock
 where item_code = 'KIT-0001' and name = 'Dinner' and unit = 'Meals'
   and not exists (select 1 from public.kitchen_audit where action = 'Kitchen item hidden (SQL 218)');

notify pgrst, 'reload schema';
commit;

-- Check: active kitchen items NOT in Kg / Litres / Nos. Empty result = all done.
select item_code, name, unit, quantity
from public.kitchen_stock
where active is distinct from false and unit not in ('Kg','Litres','Nos')
order by item_code;
