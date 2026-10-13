-- Samara ERP v2.16.45 — Guest country (Guests from other states of India, Bangladesh and other countries)
-- Adds a "country" column to patients. Safe to run again.
-- Earlier Guests keep it empty: the ERP reads an empty country as India (or as the country written in
-- the address, for a Guest whose address already names another country). Nothing else changes.
-- Until this is run, admissions still save; the country is then kept only inside the written address.

begin;

alter table public.patients add column if not exists country text;
comment on column public.patients.country is 'Country of the Guest''s home address (India, Bangladesh, …). Empty on older rows = India. v2.16.45';

notify pgrst, 'reload schema';
commit;

-- Check: should return one row "country".
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'patients' and column_name = 'country';
