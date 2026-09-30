-- SAMARA CARE ERP 2.15.17 — ONE-OFF: mark CHANDRAN (MOG-2026-09-0015) as a Trial Guest.
-- He was admitted before the Real / Trial option existed. Run AFTER 171_trial_guest_purge.sql.
-- Changes exactly one Guest, and only if both the Resident ID and the name match.
-- His pending ₹31,945 refund request is removed together with him when Admin erases him.

update public.patients
   set is_trial = true
 where patient_id = 'MOG-2026-09-0015'
   and full_name ilike '%chandran%'
returning patient_id, full_name, is_trial;
-- Expect exactly 1 row: MOG-2026-09-0015 | CHANDRAN | true
