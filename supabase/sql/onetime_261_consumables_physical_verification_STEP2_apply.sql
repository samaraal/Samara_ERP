-- Samara Care ERP — CONSUMABLES PHYSICAL VERIFICATION 20-10-2026 (Boomi)
-- STEP 2 of 2: APPLIES the correction previewed in STEP 1 (run STEP 1 first, check its table).
-- One transaction: if anything does not match, it stops and NOTHING is changed. Cannot be applied twice.
-- Result: the same table as the preview, now done. The Stock Movement Register shows each line as
--   "Opening Stock – Physical Verification 20-10-2026" / "Unknown Usage – Physical Verification 20-10-2026" /
--   "Removed from Stores – …" / "Moved to Biomedical Equipment – …".
select * from public.samara_pv_consumables_20102026(true);

-- check (optional): Consumables after the correction
-- select i.item_code, i.item_name, i.active, coalesce(sum(l.qty_in-l.qty_out) filter (where l.voided_at is null),0) as balance
--   from public.consumable_store_items i left join public.consumable_store_ledger l on l.item_id=i.id
--  where i.item_category='Consumables' group by 1,2,3 order by 1;
