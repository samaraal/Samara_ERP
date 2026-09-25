-- Diagnostic only — read-only, changes nothing.
-- Confirms why a discharge case (e.g. Mrs.Priya / MOG-2026-09-0007) shown as
-- "Awaiting Accounts" on the Discharge timeline does not appear in the
-- "Pending Financial Clearance" table on the Discharge Clearance page.
--
-- The Pending Financial Clearance table only lists a row when ALL THREE are true:
--   management_status = 'Approved'  AND  accounts_status <> 'Cleared'  AND  status <> 'Completed'
--
-- Replace 'MOG-2026-09-0007' below with the patient's code if different.

select
  d.id as discharge_id,
  p.full_name,
  p.patient_id as patient_code,
  d.status,
  d.management_status,
  d.management_approved_at,
  d.management_approved_by_name,
  d.accounts_status,
  d.accounts_cleared_at,
  d.accounts_recheck_at,
  d.accounts_remarks,
  d.created_at,
  d.updated_at
from patient_discharges d
join patients p on p.id = d.patient_id
where p.patient_id = 'MOG-2026-09-0007'
order by d.created_at desc;
