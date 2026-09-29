-- READ-ONLY diagnostic (changes nothing). Run once in Supabase → SQL Editor.
-- It returns ONE row with ONE column ("store_report"). Click the cell, copy it all
-- (or use "Download CSV") and send it to Claude. Needed before adding the new
-- Pharmacy & Stores sections (Housekeeping & General, Kitchen / Food Stores),
-- so the existing stock / charge functions are extended exactly, not guessed.
with fn as (
  select p.proname,
         pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'receive_consumable_store_stock','admin_add_store_item','admin_update_store_item',
    'admin_set_store_item_active','admin_delete_unused_store_item','store_incharge_edit_item',
    'reconcile_consumable_store_stock','approve_patient_consumable_indent_v2',
    'handover_patient_consumable_indent_v2','receive_patient_consumable_indent',
    'confirm_patient_store_return','request_patient_store_return',
    'get_charge_service_catalog','stores_controller_authorised',
    'store_incharge_set_store_item_charge_rate','admin_set_store_item_charge_rate'
  ) or (n.nspname='public' and p.oid in (
    select t.tgfoid from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.relname in ('consumable_store_items','consumable_store_ledger','consumable_store_receipts','patient_consumable_indents')
  ))
),
rel as (
  select c.relname, c.relkind,
         case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) end as viewdef
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('consumable_store_stock','consumable_store_items','consumable_store_ledger','consumable_store_receipts')
),
cols as (
  select table_name, string_agg(column_name||' '||data_type||coalesce(' default '||column_default,''),', ' order by ordinal_position) as cols
  from information_schema.columns
  where table_schema='public' and table_name in ('consumable_store_items','consumable_store_ledger','consumable_store_receipts','consumable_store_stock')
  group by table_name
),
cons as (
  select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid in ('public.consumable_store_items'::regclass,'public.consumable_store_ledger'::regclass,'public.consumable_store_receipts'::regclass)
    and contype in ('c','u')
),
trg as (
  select c.relname, t.tgname, p.proname
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
  where not t.tgisinternal and c.relname in ('consumable_store_items','consumable_store_ledger','consumable_store_receipts','patient_consumable_indents')
),
cats as (
  select coalesce(item_category,'(blank)') as item_category, count(*) as items, min(item_code) as first_code, max(item_code) as last_code
  from public.consumable_store_items group by 1
)
select concat_ws(E'\n\n',
  '=== RELATIONS ===', (select string_agg(relname||' kind='||relkind::text||coalesce(E'\n'||viewdef,''),E'\n') from rel),
  '=== COLUMNS ===', (select string_agg(table_name||': '||cols,E'\n') from cols),
  '=== CONSTRAINTS ===', (select string_agg(tbl||' '||conname||': '||def,E'\n') from cons),
  '=== TRIGGERS ===', (select string_agg(relname||' '||tgname||' -> '||proname,E'\n') from trg),
  '=== CATEGORIES IN USE ===', (select string_agg(item_category||': '||items||' items, codes '||coalesce(first_code,'-')||' .. '||coalesce(last_code,'-'),E'\n') from cats),
  '=== FUNCTIONS ===', (select string_agg(def,E'\n\n' order by proname) from fn)
) as store_report;
