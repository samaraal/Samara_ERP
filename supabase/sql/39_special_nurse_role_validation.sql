-- Samara Care ERP 1.3.14
-- Restrict internal Special Nurse assignment to Nurse/Caregiver
-- and add optional outsourced nurse registration number.

alter table public.special_nurse_assignments
  add column if not exists outsourced_registration_number text;

notify pgrst, 'reload schema';

select exists(
  select 1
  from information_schema.columns
  where table_schema='public'
    and table_name='special_nurse_assignments'
    and column_name='outsourced_registration_number'
) as outsourced_registration_number_ready;
