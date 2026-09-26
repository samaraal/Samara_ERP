-- Samara Care ERP 2.14.64 — READ-ONLY check (changes nothing).
-- Shows, per patient and Stores item, exactly what the nurse's
-- Bills & Charges list now uses:
--   to_charge = received (Indent → Hand Over → Received) − returned − already charged
-- Only rows with to_charge > 0 appear in the nurse's Consumables / Pharmacy list.
-- Change the name filter on the last line to check another patient.

with rec as (
  select patient_id, store_item_id, sum(coalesce(received_qty,0)) as received
  from public.patient_consumable_indents
  where status = 'Received'
  group by patient_id, store_item_id
),
ret as (
  select patient_id, store_item_id, sum(coalesce(quantity,0)) as returned
  from public.patient_store_returns
  where status is distinct from 'Rejected'
  group by patient_id, store_item_id
),
chg as (
  select b.patient_id, s.id as store_item_id, sum(coalesce(b.quantity,0)) as charged
  from public.bill_charge_requests b
  join public.consumable_store_items s
    on (b.store_item_id = s.id)
    or (b.store_item_id is null and lower(trim(b.service_name)) = lower(trim(s.item_name)))
  where b.category in ('Consumables','Pharmacy','Pharmacy & Basic Supplies')
    and coalesce(b.approval_status,'Pending') <> 'Rejected'
    and coalesce(b.status,'') <> 'Rejected'
  group by b.patient_id, s.id
)
select p.full_name as patient, s.item_code, s.item_name,
       rec.received, coalesce(ret.returned,0) as returned, coalesce(chg.charged,0) as charged,
       greatest(0, rec.received - coalesce(ret.returned,0) - coalesce(chg.charged,0)) as to_charge
from rec
join public.patients p on p.id = rec.patient_id
join public.consumable_store_items s on s.id = rec.store_item_id
left join ret on ret.patient_id = rec.patient_id and ret.store_item_id = rec.store_item_id
left join chg on chg.patient_id = rec.patient_id and chg.store_item_id = rec.store_item_id
where p.full_name ilike '%SHANMUGAM%'
order by s.item_name;
