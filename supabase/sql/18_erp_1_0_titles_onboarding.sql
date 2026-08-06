-- Samara Care ERP 1.0 - Titles, preferred names and first-login onboarding
-- Safe to run more than once.

alter table public.profiles
  add column if not exists title text,
  add column if not exists preferred_name text,
  add column if not exists must_change_password boolean default false;

alter table public.patients
  add column if not exists title text,
  add column if not exists preferred_name text;

-- Existing users are not forced to change password. New/reset/repaired accounts are controlled by the Edge Function.
update public.profiles set must_change_password = false where must_change_password is null;

notify pgrst, 'reload schema';

select 'profiles' as table_name, column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name in ('title','preferred_name','must_change_password')
union all
select 'patients', column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='patients' and column_name in ('title','preferred_name')
order by table_name,column_name;
