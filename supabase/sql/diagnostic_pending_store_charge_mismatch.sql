-- Diagnostic only — read-only, changes nothing.
-- For every currently PENDING Consumables/Pharmacy/Pharmacy & Basic Supplies
-- charge request, shows the live Stores Master rate x quantity (what 2.14.50
-- will require Accounts to approve) next to the old leftover Charge Master
-- tariff amount (what 2.14.49 and earlier actually required, ignoring
-- quantity). A blank "old_required_old_logic" means that item had NO
-- matching leftover tariff row at all — meaning it was completely stuck
-- and could never be approved before this fix, regardless of amount.

select
  r.id as request_id,
  r.charge_date,
  r.category,
  r.service_name,
  r.quantity,
  r.charge_item_code,
  si.item_code as live_item_code,
  si.charge_rate as live_unit_rate,
  (si.charge_rate * r.quantity) as new_required_live_logic,
  ctm.amount as old_required_old_logic
from bill_charge_requests r
left join consumable_store_items si
  on si.active = true
  and (
    (r.charge_item_code is not null and si.item_code = r.charge_item_code)
    or si.item_name = r.service_name
  )
left join charge_tariff_master ctm
  on ctm.category = r.category
  and ctm.service_name = r.service_name
  and ctm.is_active = true
where coalesce(r.approval_status, 'Pending') = 'Pending'
  and r.category in ('Consumables', 'Pharmacy', 'Pharmacy & Basic Supplies')
order by r.charge_date desc, r.service_name;
