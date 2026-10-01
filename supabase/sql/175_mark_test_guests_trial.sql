-- SAMARA CARE ERP — ONE-OFF (1 Oct 2026): mark the 14 test Guests as Trial.
-- They were admitted before the Real / Trial option existed. Run AFTER 171_trial_guest_purge.sql.
--
-- REAL Guests — never touched (the script stops if any of them is in the list):
--   MOG-2026-09-0001 Ambika Saravanan, MOG-2026-09-0006 S. Sarojini, MOG-2026-09-0018 Shylaja Nanu
--
-- Each Guest is matched by BOTH Resident ID and name. ALL-OR-NOTHING: unless exactly 14 Guests
-- match, nothing is changed and an error says why. This only sets the Trial flag — nothing is erased.

do $$
declare
  real_ids text[] := array['MOG-2026-09-0001','MOG-2026-09-0006','MOG-2026-09-0018'];
  n int;
begin
  create temp table _trial_list(resident_id text, name_like text) on commit drop;
  insert into _trial_list values
    ('MOG-2026-09-0002','%arun%'),
    ('MOG-2026-09-0003','%dharani%'),
    ('MOG-2026-09-0004','%kandasamy%'),
    ('MOG-2026-09-0005','%chithra%'),
    ('MOG-2026-09-0007','%priya%'),
    ('MOG-2026-09-0008','%shanmugam%'),
    ('MOG-2026-09-0009','%divya%'),
    ('MOG-2026-09-0010','%kasthuri%'),
    ('MOG-2026-09-0011','%lakshmi%'),
    ('MOG-2026-09-0012','%banumathi%'),
    ('MOG-2026-09-0013','%thangaraj%'),
    ('MOG-2026-09-0014','%govindh%'),
    ('MOG-2026-09-0016','%punitha%'),
    ('MOG-2026-09-0017','%muthukumar%');

  if exists(select 1 from _trial_list where resident_id = any(real_ids)) then
    raise exception 'STOPPED: a Real Guest is in the Trial list. Nothing changed.';
  end if;

  update public.patients p set is_trial = true, updated_at = now()
    from _trial_list t
   where p.patient_id = t.resident_id
     and p.full_name ilike t.name_like
     and p.patient_id <> all(real_ids);
  get diagnostics n = row_count;

  if n <> 14 then
    raise exception 'STOPPED: expected 14 Guests, matched %. Nothing changed.', n;
  end if;

  insert into public.audit_log(user_id, action, entity, entity_id, details)
  values (auth.uid(), 'TEST_GUESTS_MARKED_TRIAL', 'patients', null,
          jsonb_build_object('count', n, 'resident_ids', (select jsonb_agg(resident_id) from _trial_list), 'at', now()));
end $$;

-- Check: 14 rows TRUE, and the 3 real Guests FALSE
select patient_id as resident_id, full_name, is_active, is_trial
from public.patients
order by is_trial, patient_id;
