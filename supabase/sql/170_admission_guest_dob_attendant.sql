-- 170 (app 2.15.12): Admission form — Guest Date of Birth + "Is an attendant staying with the Guest?"
-- Run this BEFORE uploading the 2.15.12 frontend (the admission form saves these two columns).
-- Safe to run more than once. Changes no existing data.

begin;
alter table public.patients add column if not exists date_of_birth date;
alter table public.patients add column if not exists attendant_staying boolean;
comment on column public.patients.date_of_birth is 'Optional. When entered at admission, Age is calculated from it.';
comment on column public.patients.attendant_staying is 'Admission: is an attendant staying with the Guest? true = yes (attendant name/mobile recorded), false = no attendant, null = not asked (older admissions).';
notify pgrst,'reload schema';
commit;

-- Verify: should return 2.
select count(*) as new_columns_present from information_schema.columns
where table_schema='public' and table_name='patients' and column_name in ('date_of_birth','attendant_staying');
