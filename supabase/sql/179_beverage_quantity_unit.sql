-- SAMARA CARE ERP 2.15.40 — Beverage quantity with a unit (ml, cup, glass, tumbler, mug, tsp, tbsp, g, mg).
-- Run AFTER 177_beverage_records.sql. Run this whole file once in Supabase > SQL Editor. Safe to run again.
-- Existing entries keep their quantity_ml (shown as "… ml"); quantity_ml is still filled when the unit is ml.

alter table public.beverage_records add column if not exists quantity numeric(10,2);
alter table public.beverage_records add column if not exists quantity_unit text;

-- Earlier entries recorded in ml.
update public.beverage_records set quantity=quantity_ml, quantity_unit='ml'
 where quantity is null and quantity_ml is not null;

alter table public.beverage_records drop constraint if exists beverage_records_unit_check;
alter table public.beverage_records add constraint beverage_records_unit_check
  check (quantity_unit is null or quantity_unit in ('ml','cup','glass','tumbler','mug','tsp','tbsp','g','mg'));
alter table public.beverage_records drop constraint if exists beverage_records_quantity_value_check;
alter table public.beverage_records add constraint beverage_records_quantity_value_check
  check (quantity is null or (quantity>0 and quantity<=5000 and quantity_unit is not null));

notify pgrst, 'reload schema';

-- Check: should show unit_ready = true
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='beverage_records' and column_name='quantity_unit') as unit_ready;
