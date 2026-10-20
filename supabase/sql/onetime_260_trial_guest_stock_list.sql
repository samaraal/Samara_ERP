-- Samara ERP — ONE TIME, READ-ONLY (changes nothing). 20-10-2026.
-- Stock that was issued to the erased TRIAL Guests (Pharmacy & Consumables).
-- The Trial erase keeps the Stores ledger and only removes the Guest's name from those lines, so
-- these quantities are STILL counted as "Used to Guests" (they were NOT added back to Stores).
-- A line belongs to an erased Trial Guest when it is a Guest issue / return that is no longer linked
-- to any Guest and its indent no longer exists. Outside Nursing lines are left out.
-- Run in Supabase → SQL Editor. Result: one row per item, with S.No.

with l as (
  select to_jsonb(x) j, x.* from public.consumable_store_ledger x
  where x.voided_at is null and x.movement_type in ('Patient Issue','Return to Store')
),
trial as (
  select l.* from l
  where nullif(l.j->>'patient_id','') is null
    and nullif(l.j->>'patient_name','') is null
    and coalesce(l.reference_text,'') not ilike '%outside%'
    and not exists (select 1 from public.patient_consumable_indents i
                    where i.id::text = coalesce(l.j->>'indent_id', l.j->>'reference_id', '-'))
)
select row_number() over (order by coalesce(i.item_category,'Consumables'), i.item_code nulls last, i.item_name) as "S.No.",
       coalesce(i.item_category,'Consumables')             as "Section",
       i.item_code                                          as "Item Code",
       i.item_name                                          as "Item Name",
       i.unit                                               as "Unit",
       sum(case when t.movement_type='Patient Issue' then t.qty_out-t.qty_in else 0 end)      as "Issued to Trial Guests",
       sum(case when t.movement_type='Return to Store' then t.qty_in-t.qty_out else 0 end)    as "Returned to Stores",
       sum(case when t.movement_type='Patient Issue' then t.qty_out-t.qty_in else -(t.qty_in-t.qty_out) end) as "Net still counted as used",
       count(*)                                             as "Ledger lines",
       to_char(min(t.movement_at) at time zone 'Asia/Kolkata','DD-MM-YYYY') as "From",
       to_char(max(t.movement_at) at time zone 'Asia/Kolkata','DD-MM-YYYY') as "To"
from trial t join public.consumable_store_items i on i.id=t.item_id
where coalesce(i.item_category,'Consumables') in ('Pharmacy','Consumables')
group by i.id,i.item_category,i.item_code,i.item_name,i.unit
order by 1;

-- OPTIONAL cross-check: the stock list saved in the audit log at each bulk erase
-- (run this separately — select it and press Run):
-- select to_char(created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as erased_at,
--        e->>'item' as item, e->>'handed_over' as handed_over, e->>'received' as received
-- from public.audit_log a, jsonb_array_elements(coalesce(a.details->'stock_issued','[]'::jsonb)) e
-- where a.action='TRIAL_GUESTS_BULK_PURGED' order by a.created_at, item;
